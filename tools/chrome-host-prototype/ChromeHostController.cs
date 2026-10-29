using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyVersion("0.1.2.0")]
[assembly: AssemblyFileVersion("0.1.2.0")]
[assembly: AssemblyProduct("Glance Chrome host prototype")]

namespace ChromeHostPrototype
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length > 0 && args[0] == "--self-test")
            {
                string report = null;
                for (int i = 1; i < args.Length; i++)
                    if (args[i].StartsWith("--report=", StringComparison.OrdinalIgnoreCase))
                        report = args[i].Substring("--report=".Length);
                Environment.ExitCode = SelfTest.Run(report);
                return;
            }
            Application.Run(new ControllerForm());
        }
    }

    internal static class ChromeLaunchConfiguration
    {
        internal const string GeminiUrl = "https://gemini.google.com/app";

        internal static string GetDedicatedProfilePath(string localAppDataPath)
        {
            if (string.IsNullOrWhiteSpace(localAppDataPath)) throw new ArgumentException("Local application data path is required.", "localAppDataPath");
            string localAppData = Path.GetFullPath(localAppDataPath);
            string dedicated = Path.GetFullPath(Path.Combine(localAppData, "GlanceAI", "BrowserProfile"));
            string regularChromeProfile = Path.GetFullPath(Path.Combine(localAppData, "Google", "Chrome", "User Data"));
            if (!Path.IsPathRooted(dedicated) || PathsOverlap(dedicated, regularChromeProfile))
                throw new InvalidOperationException("The Glance profile must remain separate from the normal Chrome profile.");
            return dedicated;
        }

        internal static string BuildArguments(string localAppDataPath)
        {
            string profilePath = GetDedicatedProfilePath(localAppDataPath);
            return "--user-data-dir=\"" + profilePath.Replace("\"", "\\\"") + "\" --app=" + GeminiUrl + " --new-window";
        }

        internal static bool PathsOverlap(string firstPath, string secondPath)
        {
            string first = NormalizePath(firstPath);
            string second = NormalizePath(secondPath);
            return string.Equals(first, second, StringComparison.OrdinalIgnoreCase) ||
                IsChildPath(first, second) || IsChildPath(second, first);
        }

        private static string NormalizePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("A path is required.", "path");
            string fullPath = Path.GetFullPath(path);
            string root = Path.GetPathRoot(fullPath);
            while (fullPath.Length > root.Length && (fullPath.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal) ||
                fullPath.EndsWith(Path.AltDirectorySeparatorChar.ToString(), StringComparison.Ordinal)))
                fullPath = fullPath.Substring(0, fullPath.Length - 1);
            return fullPath;
        }

        private static bool IsChildPath(string candidate, string parent)
        {
            string prefix = parent.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal) ||
                parent.EndsWith(Path.AltDirectorySeparatorChar.ToString(), StringComparison.Ordinal)
                ? parent : parent + Path.DirectorySeparatorChar;
            return candidate.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
        }
    }

    internal sealed class ChromeProcessIdentity
    {
        private readonly int processId;
        private readonly string processName;
        private readonly string executablePath;
        private readonly long startTimeUtcTicks;

        internal ChromeProcessIdentity(int id, string name, string path, long startTicks)
        {
            processId = id;
            processName = name;
            executablePath = Path.GetFullPath(path);
            startTimeUtcTicks = startTicks;
        }

        internal int ProcessId { get { return processId; } }

        internal static ChromeProcessIdentity Capture(Process process)
        {
            if (process == null) throw new ArgumentNullException("process");
            return new ChromeProcessIdentity(process.Id, process.ProcessName,
                Path.GetFullPath(process.MainModule.FileName), process.StartTime.ToUniversalTime().Ticks);
        }

        internal bool MatchesIdentity(int id, string name, string path, long startTicks)
        {
            return id == processId &&
                string.Equals(name, processName, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(Path.GetFullPath(path), executablePath, StringComparison.OrdinalIgnoreCase) &&
                startTicks == startTimeUtcTicks;
        }

        internal bool IsCurrentIdentity()
        {
            try
            {
                using (Process current = Process.GetProcessById(processId))
                    return MatchesIdentity(current.Id, current.ProcessName,
                        Path.GetFullPath(current.MainModule.FileName), current.StartTime.ToUniversalTime().Ticks);
            }
            catch { return false; }
        }

        internal bool OwnsWindow(IntPtr hwnd)
        {
            if (!Native.IsWindow(hwnd)) return false;
            uint windowProcessId;
            Native.GetWindowThreadProcessId(hwnd, out windowProcessId);
            return windowProcessId == (uint)processId && IsCurrentIdentity();
        }
    }

    internal sealed class ControllerForm : Form
    {
        private const string GeminiUrl = ChromeLaunchConfiguration.GeminiUrl;
        private readonly Label status = new Label();
        private readonly Label profileNotice = new Label();
        private readonly TrackBar opacity = new TrackBar();
        private readonly Label opacityText = new Label();
        private readonly CheckBox topmost = new CheckBox();
        private readonly Button moveLeft = new Button();
        private readonly Button moveRight = new Button();
        private readonly Button moveUp = new Button();
        private readonly Button moveDown = new Button();
        private readonly Button hideButton = new Button();
        private readonly Button showButton = new Button();
        private readonly Button restoreButton = new Button();
        private readonly Button releaseButton = new Button();
        private readonly Button openButton = new Button();
        private WindowLease lease;
        private ScopedShortcutController shortcutController;
        private bool locating;
        private bool syncingControls;
        private CancellationTokenSource searchCancellation;

        internal ControllerForm()
        {
            Text = "Chrome host prototype 0.1.2";
            TopMost = true;
            MinimumSize = new Size(330, 420);
            Size = new Size(370, 470);
            StartPosition = FormStartPosition.CenterScreen;
            BuildControls();
            FormClosing += OnFormClosing;
        }

        private void BuildControls()
        {
            var layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.Padding = new Padding(12);
            layout.ColumnCount = 2;
            layout.RowCount = 9;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            Controls.Add(layout);

            openButton.Text = "Open Gemini";
            openButton.AccessibleName = "Open Gemini in a new Chrome app window";
            openButton.Dock = DockStyle.Fill;
            openButton.Click += async delegate { await OpenGemini(); };
            layout.Controls.Add(openButton, 0, 0);
            layout.SetColumnSpan(openButton, 2);

            status.Text = "No Chrome window is attached.";
            status.AccessibleName = "Controller status";
            status.AutoSize = true;
            status.Dock = DockStyle.Fill;
            status.Padding = new Padding(0, 8, 0, 8);
            layout.Controls.Add(status, 0, 1);
            layout.SetColumnSpan(status, 2);

            profileNotice.Text = "Gemini uses a separate Glance Chrome profile. Sign in manually the first time; everyday Chrome data is not shared.";
            profileNotice.AccessibleName = "Separate Chrome profile and sign-in information";
            profileNotice.AutoSize = true;
            profileNotice.Dock = DockStyle.Fill;
            profileNotice.Padding = new Padding(0, 4, 0, 4);
            layout.Controls.Add(profileNotice, 0, 2);
            layout.SetColumnSpan(profileNotice, 2);

            opacityText.Text = "Opacity: 100%";
            opacityText.AutoSize = true;
            opacityText.Anchor = AnchorStyles.Left;
            layout.Controls.Add(opacityText, 0, 3);
            opacity.Minimum = 15;
            opacity.Maximum = 100;
            opacity.Value = 100;
            opacity.TickFrequency = 5;
            opacity.SmallChange = 1;
            opacity.LargeChange = 5;
            opacity.AccessibleName = "Chrome window opacity, 15 to 100 percent";
            opacity.Dock = DockStyle.Fill;
            opacity.ValueChanged += delegate
            {
                opacityText.Text = "Opacity: " + opacity.Value + "%";
                if (!syncingControls) ApplyOpacity();
            };
            layout.Controls.Add(opacity, 0, 4);
            layout.SetColumnSpan(opacity, 2);

            topmost.Text = "Keep Chrome above other windows";
            topmost.AccessibleName = topmost.Text;
            topmost.AutoSize = true;
            topmost.CheckedChanged += delegate { ApplyTopmost(); };
            layout.Controls.Add(topmost, 0, 5);
            layout.SetColumnSpan(topmost, 2);

            var arrows = new TableLayoutPanel();
            arrows.ColumnCount = 3;
            arrows.RowCount = 2;
            arrows.Dock = DockStyle.Fill;
            arrows.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33));
            arrows.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 34));
            arrows.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33));
            arrows.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            arrows.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            ConfigureButton(moveUp, "↑", "Move Chrome up 40 pixels", delegate { MoveBy(0, -40); });
            ConfigureButton(moveLeft, "←", "Move Chrome left 40 pixels", delegate { MoveBy(-40, 0); });
            ConfigureButton(moveDown, "↓", "Move Chrome down 40 pixels", delegate { MoveBy(0, 40); });
            ConfigureButton(moveRight, "→", "Move Chrome right 40 pixels", delegate { MoveBy(40, 0); });
            arrows.Controls.Add(moveUp, 1, 0);
            arrows.Controls.Add(moveLeft, 0, 1);
            arrows.Controls.Add(moveDown, 1, 1);
            arrows.Controls.Add(moveRight, 2, 1);
            layout.Controls.Add(arrows, 0, 6);
            layout.SetColumnSpan(arrows, 2);

            ConfigureButton(hideButton, "Hide", "Hide Chrome window", delegate { SetVisibility(false); });
            ConfigureButton(showButton, "Show", "Show Chrome window", delegate { SetVisibility(true); });
            layout.Controls.Add(hideButton, 0, 7);
            layout.Controls.Add(showButton, 1, 7);

            ConfigureButton(restoreButton, "Restore", "Restore Chrome window settings", RestoreTarget);
            ConfigureButton(releaseButton, "Release", "Release Chrome window control", ReleaseTarget);
            layout.Controls.Add(restoreButton, 0, 8);
            layout.Controls.Add(releaseButton, 1, 8);
            SetControlsEnabled(false);
        }

        private static void ConfigureButton(Button button, string text, string accessibleName, Action action)
        {
            button.Text = text;
            button.AccessibleName = accessibleName;
            button.Dock = DockStyle.Fill;
            button.Click += delegate { action(); };
        }

        private async Task OpenGemini()
        {
            if (lease != null) { SetStatus("Release the current Chrome window before opening another."); return; }
            if (locating) return;
            locating = true;
            searchCancellation = new CancellationTokenSource();
            CancellationToken token = searchCancellation.Token;
            openButton.Enabled = false;
            SetStatus("Opening Gemini in a separate Glance profile. Sign in manually if prompted.");
            try
            {
                string chrome = FindChromeExecutable();
                if (chrome == null)
                    throw new InvalidOperationException("Chrome was not found in standard install locations.");

                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string profileDirectory = ChromeLaunchConfiguration.GetDedicatedProfilePath(localAppData);
                Directory.CreateDirectory(profileDirectory);

                HashSet<IntPtr> before = EnumerateChromeWindows();
                Process launchedProcess = Process.Start(new ProcessStartInfo
                {
                    FileName = chrome,
                    Arguments = ChromeLaunchConfiguration.BuildArguments(localAppData),
                    UseShellExecute = false,
                    WorkingDirectory = Path.GetDirectoryName(chrome)
                });
                if (launchedProcess == null)
                    throw new InvalidOperationException("Windows did not return the Chrome launch process; no browser window was attached.");
                ChromeProcessIdentity launchedIdentity = null;
                try { using (launchedProcess) launchedIdentity = ChromeProcessIdentity.Capture(launchedProcess); }
                catch (Exception ex)
                {
                    throw new InvalidOperationException("Chrome's launch process exited before it could be verified. It may have forwarded the request to an existing Chrome process. No window was attached.", ex);
                }

                IntPtr found = await Task.Run(delegate { return WaitForNewChromeWindow(before, launchedIdentity, 15000, token); });
                if (token.IsCancellationRequested || IsDisposed || Disposing) return;
                if (found == IntPtr.Zero)
                {
                    if (!launchedIdentity.IsCurrentIdentity())
                        throw new InvalidOperationException("Chrome's launch process exited before its window could be verified. It may have forwarded the request to an existing Chrome process. To avoid attaching an unrelated Chrome window, nothing was attached. Close the Glance Chrome window and retry.");
                    throw new InvalidOperationException("No new visible Chrome window owned by the launched Chrome process appeared within 15 seconds.");
                }
                if (!launchedIdentity.IsCurrentIdentity())
                    throw new InvalidOperationException("Chrome's launch process exited before attachment. To avoid attaching an unrelated Chrome window, nothing was attached.");
                WindowLease foundLease = new WindowLease(found, launchedIdentity);
                ScopedShortcutController foundShortcutController = new ScopedShortcutController(
                    foundLease,
                    delegate { SetVisibilityFromShortcut(); },
                    QueueShortcutAction,
                    delegate { OnShortcutTargetLost(foundLease); });
                lease = foundLease;
                shortcutController = foundShortcutController;
                ApplyLeaseStateToControls();
                SetControlsEnabled(true);
                SetStatus("Attached. Sign in manually if Gemini asks. Ctrl+H hides this window; use Show to bring it back.");
            }
            catch (Exception ex)
            {
                if (!IsDisposed && !Disposing && !token.IsCancellationRequested) SetStatus(ex.Message);
            }
            finally
            {
                locating = false;
                if (searchCancellation != null) { searchCancellation.Dispose(); searchCancellation = null; }
                if (!IsDisposed && !Disposing) openButton.Enabled = true;
            }
        }

        private void ApplyLeaseStateToControls()
        {
            if (lease == null) return;
            syncingControls = true;
            if (lease.OriginalOpacity.HasValue)
                opacity.Value = Math.Max(opacity.Minimum, Math.Min(opacity.Maximum, lease.OriginalOpacity.Value));
            else
                opacity.Value = 100;
            topmost.Checked = lease.OriginalTopmost;
            opacity.Enabled = lease.OriginalOpacity.HasValue;
            syncingControls = false;
        }

        private static string FindChromeExecutable()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google\\Chrome\\Application\\chrome.exe")
            };
            foreach (string candidate in candidates)
                if (File.Exists(candidate)) return candidate;
            return null;
        }

        private static HashSet<IntPtr> EnumerateChromeWindows()
        {
            var result = new HashSet<IntPtr>();
            Native.EnumWindows(delegate(IntPtr hwnd, IntPtr lParam)
            {
                if (!Native.IsWindowVisible(hwnd) || Native.GetClassName(hwnd) != "Chrome_WidgetWin_1") return true;
                uint pid;
                Native.GetWindowThreadProcessId(hwnd, out pid);
                try
                {
                    using (Process process = Process.GetProcessById((int)pid))
                        if (string.Equals(process.ProcessName, "chrome", StringComparison.OrdinalIgnoreCase))
                            result.Add(hwnd);
                }
                catch { }
                return true;
            }, IntPtr.Zero);
            return result;
        }

        private static IntPtr WaitForNewChromeWindow(HashSet<IntPtr> before, ChromeProcessIdentity expectedProcess, int timeoutMs, CancellationToken token)
        {
            Stopwatch timer = Stopwatch.StartNew();
            IntPtr stableCandidate = IntPtr.Zero;
            Stopwatch stableTimer = new Stopwatch();
            while (timer.ElapsedMilliseconds < timeoutMs)
            {
                if (token.IsCancellationRequested) return IntPtr.Zero;
                if (!expectedProcess.IsCurrentIdentity()) return IntPtr.Zero;
                List<IntPtr> candidates = new List<IntPtr>();
                Native.EnumWindows(delegate(IntPtr hwnd, IntPtr lParam)
                {
                    if (before.Contains(hwnd) || Native.GetWindow(hwnd, Native.GW_OWNER) != IntPtr.Zero ||
                        !Native.IsWindowVisible(hwnd) || Native.GetClassName(hwnd) != "Chrome_WidgetWin_1") return true;
                    if (expectedProcess.OwnsWindow(hwnd)) candidates.Add(hwnd);
                    return true;
                }, IntPtr.Zero);

                if (candidates.Count == 1)
                {
                    if (stableCandidate != candidates[0])
                    {
                        stableCandidate = candidates[0];
                        stableTimer.Restart();
                    }
                    else if (stableTimer.ElapsedMilliseconds >= 600)
                        return stableCandidate;
                }
                else
                {
                    stableCandidate = IntPtr.Zero;
                    stableTimer.Reset();
                    if (candidates.Count > 1) return IntPtr.Zero;
                }
                Thread.Sleep(100);
            }
            return IntPtr.Zero;
        }

        private void ApplyOpacity()
        {
            if (!TryValidate()) return;
            try
            {
                lease.SetOpacity(opacity.Value);
                SetStatus("Chrome opacity set to " + opacity.Value + "%.");
            }
            catch (Exception ex) { SetStatus(ex.Message); }
        }

        private void ApplyTopmost()
        {
            if (syncingControls || !TryValidate()) return;
            try
            {
                lease.SetTopmost(topmost.Checked);
                BringToFront();
                Activate();
                SetStatus(topmost.Checked ? "Chrome is above other windows. The controller is ready above it." : "Chrome is no longer kept above other windows.");
            }
            catch (Exception ex) { SetStatus(ex.Message); }
        }

        private void MoveBy(int dx, int dy)
        {
            if (!TryValidate()) return;
            try { lease.MoveBy(dx, dy); SetStatus("Moved Chrome by 40 pixels."); }
            catch (Exception ex) { SetStatus(ex.Message); }
        }

        private void SetVisibility(bool visible)
        {
            if (!TryValidate()) return;
            try { lease.SetVisible(visible); SetStatus(visible ? "Chrome is visible." : "Chrome is hidden."); }
            catch (Exception ex) { SetStatus(ex.Message); }
        }

        private void SetVisibilityFromShortcut()
        {
            if (lease == null || !lease.Validate())
            {
                ReleaseShortcutController();
                return;
            }
            try { lease.SetVisible(false); SetStatus("Chrome hidden. Use Show to bring it back."); }
            catch (Exception ex) { SetStatus(ex.Message); }
        }

        private void QueueShortcutAction(Action action)
        {
            if (IsDisposed || Disposing || !IsHandleCreated) return;
            try { BeginInvoke(action); }
            catch (InvalidOperationException) { }
        }

        private void OnShortcutTargetLost(WindowLease lostLease)
        {
            if (!object.ReferenceEquals(lease, lostLease)) return;
            ReleaseShortcutController();
            lease = null;
            SetControlsEnabled(false);
            SetStatus("The attached Chrome window closed or changed. Control was released.");
        }

        private void ReleaseShortcutController()
        {
            if (shortcutController == null) return;
            shortcutController.Dispose();
            shortcutController = null;
        }

        private bool TryValidate()
        {
            if (lease == null) { SetStatus("Open Gemini before changing a Chrome window."); return false; }
            if (!lease.Validate())
            {
                ReleaseShortcutController();
                lease = null;
                SetControlsEnabled(false);
                SetStatus("The attached Chrome window closed or changed. Control was released.");
                return false;
            }
            return true;
        }

        private void RestoreTarget()
        {
            if (lease == null) return;
            if (!lease.Validate()) { ReleaseShortcutController(); lease = null; SetControlsEnabled(false); SetStatus("The Chrome window closed. Control was released."); return; }
            try { lease.Restore(); ApplyLeaseStateToControls(); SetStatus("Restored the Chrome window’s original settings."); }
            catch (Exception ex) { SetStatus(ex.Message); }
        }

        private void ReleaseTarget()
        {
            if (lease == null) return;
            if (!lease.Validate()) { ReleaseShortcutController(); lease = null; SetControlsEnabled(false); SetStatus("The Chrome window closed. Control was released."); return; }
            try { lease.Restore(); ReleaseShortcutController(); lease = null; SetControlsEnabled(false); SetStatus("Restored and released the Chrome window."); }
            catch (Exception ex) { SetStatus(ex.Message); }
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            if (searchCancellation != null) searchCancellation.Cancel();
            if (lease != null)
            {
                if (!lease.Validate()) { ReleaseShortcutController(); lease = null; return; }
                try { lease.Restore(); }
                catch (Exception ex)
                {
                    SetStatus("Could not restore Chrome. Keep this controller open and try Restore again. " + ex.Message);
                    e.Cancel = true;
                }
            }
            if (!e.Cancel) ReleaseShortcutController();
        }

        private void SetControlsEnabled(bool enabled)
        {
            opacity.Enabled = enabled && lease != null && lease.OriginalOpacity.HasValue;
            topmost.Enabled = enabled;
            moveLeft.Enabled = enabled; moveRight.Enabled = enabled;
            moveUp.Enabled = enabled; moveDown.Enabled = enabled;
            hideButton.Enabled = enabled; showButton.Enabled = enabled;
            restoreButton.Enabled = enabled; releaseButton.Enabled = enabled;
        }

        private void SetStatus(string message) { if (!IsDisposed && !Disposing) status.Text = message; }
    }

    internal sealed class WindowLease
    {
        private readonly IntPtr hwnd;
        private readonly int pid;
        private readonly long processStartTicks;
        private readonly string processName;
        private readonly string processPath;
        private readonly string windowClass;
        private readonly long originalExStyle;
        private readonly bool originallyLayered;
        private readonly bool layeredStateCaptured;
        private readonly byte originalAlpha;
        private readonly uint originalColorKey;
        private readonly uint originalLayerFlags;
        private readonly Native.WINDOWPLACEMENT placement;
        private readonly Rectangle bounds;
        private readonly bool wasVisible;
        private readonly bool wasTopmost;
        internal IntPtr Handle { get { return hwnd; } }
        internal int? OriginalOpacity { get; private set; }
        internal bool OriginalTopmost { get { return wasTopmost; } }

        internal WindowLease(IntPtr target) : this(target, false, null) { }

        internal WindowLease(IntPtr target, ChromeProcessIdentity expectedProcess) : this(target, false, expectedProcess) { }

        internal WindowLease(IntPtr target, bool allowTestWindow) : this(target, allowTestWindow, null) { }

        private WindowLease(IntPtr target, bool allowTestWindow, ChromeProcessIdentity expectedProcess)
        {
            hwnd = target;
            windowClass = Native.GetClassName(hwnd);
            if (!Native.IsWindow(hwnd) || (!allowTestWindow && windowClass != "Chrome_WidgetWin_1"))
                throw new InvalidOperationException("The candidate is not an eligible window.");
            if (!allowTestWindow && expectedProcess == null)
                throw new InvalidOperationException("A verified Chrome process identity is required for attachment.");
            uint processId;
            Native.GetWindowThreadProcessId(hwnd, out processId);
            pid = (int)processId;
            using (Process process = Process.GetProcessById(pid))
            {
                processName = process.ProcessName;
                if (!allowTestWindow && !string.Equals(processName, "chrome", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("The candidate process is not Chrome.");
                processPath = Path.GetFullPath(process.MainModule.FileName);
                processStartTicks = process.StartTime.ToUniversalTime().Ticks;
            }
            if (expectedProcess != null &&
                !expectedProcess.MatchesIdentity(pid, processName, processPath, processStartTicks))
                throw new InvalidOperationException("The window is not owned by the verified Chrome process that was launched.");
            originalExStyle = Native.GetWindowLongPtr(hwnd, Native.GWL_EXSTYLE).ToInt64();
            originallyLayered = (originalExStyle & Native.WS_EX_LAYERED) != 0;
            wasTopmost = (originalExStyle & Native.WS_EX_TOPMOST) != 0;
            layeredStateCaptured = !originallyLayered || Native.GetLayeredWindowAttributes(hwnd, out originalColorKey, out originalAlpha, out originalLayerFlags);
            if (!layeredStateCaptured)
                throw new InvalidOperationException("Windows could not read the candidate’s original layered settings; it was left unchanged.");
            if (originallyLayered && layeredStateCaptured && (originalLayerFlags & Native.LWA_ALPHA) != 0)
                OriginalOpacity = (int)Math.Round(originalAlpha * 100.0 / 255.0, MidpointRounding.AwayFromZero);
            else if (!originallyLayered)
                OriginalOpacity = 100;
            Native.WINDOWPLACEMENT p = new Native.WINDOWPLACEMENT();
            p.length = Marshal.SizeOf(typeof(Native.WINDOWPLACEMENT));
            if (!Native.GetWindowPlacement(hwnd, ref p)) throw new InvalidOperationException("Could not capture Chrome window placement.");
            placement = p;
            Native.RECT r;
            if (!Native.GetWindowRect(hwnd, out r)) throw new InvalidOperationException("Could not capture Chrome window bounds.");
            bounds = Rectangle.FromLTRB(r.Left, r.Top, r.Right, r.Bottom);
            wasVisible = Native.IsWindowVisible(hwnd);
        }

        internal bool Validate()
        {
            if (!Native.IsWindow(hwnd) || Native.GetClassName(hwnd) != windowClass) return false;
            uint currentPid;
            Native.GetWindowThreadProcessId(hwnd, out currentPid);
            if (currentPid != (uint)pid) return false;
            try
            {
                using (Process process = Process.GetProcessById(pid))
                    return string.Equals(process.ProcessName, processName, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(Path.GetFullPath(process.MainModule.FileName), processPath, StringComparison.OrdinalIgnoreCase) &&
                        process.StartTime.ToUniversalTime().Ticks == processStartTicks;
            }
            catch { return false; }
        }

        internal void SetOpacity(int percent)
        {
            EnsureValid();
            if (percent < 15 || percent > 100) throw new ArgumentOutOfRangeException("percent", "Opacity must be between 15 and 100 percent.");
            long style = Native.GetWindowLongPtr(hwnd, Native.GWL_EXSTYLE).ToInt64();
            if ((style & Native.WS_EX_LAYERED) == 0)
            {
                EnsureValid();
                Native.SetLastError(0);
                if (Native.SetWindowLongPtr(hwnd, Native.GWL_EXSTYLE, new IntPtr(style | Native.WS_EX_LAYERED)) == IntPtr.Zero && Marshal.GetLastWin32Error() != 0)
                    throw new InvalidOperationException("Windows could not enable layered opacity for Chrome.");
            }
            byte alpha = (byte)Math.Round(percent * 255.0 / 100.0, MidpointRounding.AwayFromZero);
            EnsureValid();
            if (!Native.SetLayeredWindowAttributes(hwnd, 0, alpha, Native.LWA_ALPHA))
                throw new InvalidOperationException("Windows could not set Chrome opacity.");
        }

        internal void SetTopmost(bool value)
        {
            EnsureValid();
            long beforeStyle = Native.GetWindowLongPtr(hwnd, Native.GWL_EXSTYLE).ToInt64();
            bool beforeVisible = Native.IsWindowVisible(hwnd);
            Native.SetLastError(0);
            if (!Native.SetWindowPos(hwnd, value ? Native.HWND_TOPMOST : Native.HWND_NOTOPMOST, 0, 0, 0, 0,
                Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE))
                throw new InvalidOperationException("SetWindowPos failed. Win32 error=" + Marshal.GetLastWin32Error() + ", visible=" + beforeVisible + ", style before=0x" + beforeStyle.ToString("X") + ".");
            Stopwatch wait = Stopwatch.StartNew();
            long observedStyle = 0;
            while (wait.ElapsedMilliseconds < 500)
            {
                observedStyle = Native.GetWindowLongPtr(hwnd, Native.GWL_EXSTYLE).ToInt64();
                if (((observedStyle & Native.WS_EX_TOPMOST) != 0) == value) return;
                Thread.Sleep(10);
            }
            throw new InvalidOperationException("Windows accepted the topmost change but did not expose it in the extended style within 500 ms. Visible before=" + beforeVisible + ", style before=0x" + beforeStyle.ToString("X") + ", style after=0x" + observedStyle.ToString("X") + ".");
        }

        internal void MoveBy(int dx, int dy)
        {
            EnsureValid();
            Native.RECT rect;
            if (!Native.GetWindowRect(hwnd, out rect)) throw new InvalidOperationException("Windows could not read Chrome bounds.");
            EnsureValid();
            if (!Native.SetWindowPos(hwnd, IntPtr.Zero, rect.Left + dx, rect.Top + dy, 0, 0,
                Native.SWP_NOSIZE | Native.SWP_NOZORDER | Native.SWP_NOACTIVATE))
                throw new InvalidOperationException("Windows could not move Chrome.");
        }

        internal void SetVisible(bool visible)
        {
            EnsureValid();
            if (!Native.ShowWindow(hwnd, visible ? Native.SW_SHOW : Native.SW_HIDE))
            {
                if (!Native.IsWindow(hwnd) || Native.IsWindowVisible(hwnd) != visible)
                    throw new InvalidOperationException("Windows could not change Chrome visibility.");
            }
        }

        internal void Restore()
        {
            EnsureValid();
            long currentStyle = Native.GetWindowLongPtr(hwnd, Native.GWL_EXSTYLE).ToInt64();
            long changedBits = Native.WS_EX_LAYERED | Native.WS_EX_TOPMOST;
            long restoredStyle = (currentStyle & ~changedBits) | (originalExStyle & changedBits);
            EnsureValid();
            Native.SetLastError(0);
            if (Native.SetWindowLongPtr(hwnd, Native.GWL_EXSTYLE, new IntPtr(restoredStyle)) == IntPtr.Zero && Marshal.GetLastWin32Error() != 0)
                throw new InvalidOperationException("Windows could not restore Chrome window styles.");
            if (originallyLayered)
            {
                if (!layeredStateCaptured)
                    throw new InvalidOperationException("Chrome’s original layered opacity could not be read, so it was not guessed.");
                EnsureValid();
                if (!Native.SetLayeredWindowAttributes(hwnd, originalColorKey, originalAlpha, originalLayerFlags))
                    throw new InvalidOperationException("Windows could not restore Chrome’s original layered settings.");
            }
            Native.WINDOWPLACEMENT savedPlacement = placement;
            EnsureValid();
            if (!Native.SetWindowPlacement(hwnd, ref savedPlacement) &&
                !RestoreBoundsAfterIdentityCheck()) throw new InvalidOperationException("Windows could not restore Chrome placement.");
            EnsureValid();
            if (!Native.SetWindowPos(hwnd, wasTopmost ? Native.HWND_TOPMOST : Native.HWND_NOTOPMOST,
                0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE))
                throw new InvalidOperationException("Windows could not restore Chrome’s topmost state.");
            if (Native.IsWindowVisible(hwnd) != wasVisible)
            {
                EnsureValid();
                if (!Native.ShowWindow(hwnd, wasVisible ? Native.SW_SHOW : Native.SW_HIDE) && Native.IsWindowVisible(hwnd) != wasVisible)
                    throw new InvalidOperationException("Windows could not restore Chrome visibility.");
            }
        }

        private bool RestoreBoundsAfterIdentityCheck()
        {
            EnsureValid();
            return Native.SetWindowPos(hwnd, wasTopmost ? Native.HWND_TOPMOST : Native.HWND_NOTOPMOST,
                bounds.Left, bounds.Top, bounds.Width, bounds.Height, Native.SWP_NOACTIVATE | Native.SWP_NOOWNERZORDER);
        }

        private void EnsureValid()
        {
            if (!Validate()) throw new InvalidOperationException("The Chrome window identity changed or the window closed.");
        }
    }

    internal sealed class ScopedShortcutController : IDisposable
    {
        private readonly WindowLease lease;
        private readonly Action hideTarget;
        private readonly Action<Action> queueHideTarget;
        private readonly Action targetLost;
        private readonly Native.LowLevelKeyboardProc keyboardCallback;
        private readonly Native.WinEventProc eventCallback;
        private readonly ScopedShortcutState shortcutState = new ScopedShortcutState();
        private IntPtr keyboardHook;
        private IntPtr destroyHook;
        private bool disposed;

        internal ScopedShortcutController(WindowLease targetLease, Action hide, Action<Action> queueHide, Action lost)
        {
            if (targetLease == null) throw new ArgumentNullException("targetLease");
            if (hide == null) throw new ArgumentNullException("hide");
            if (queueHide == null) throw new ArgumentNullException("queueHide");
            if (lost == null) throw new ArgumentNullException("lost");
            lease = targetLease;
            hideTarget = hide;
            queueHideTarget = queueHide;
            targetLost = lost;
            keyboardCallback = OnKeyboard;
            eventCallback = OnWinEvent;
            keyboardHook = Native.SetWindowsHookEx(Native.WH_KEYBOARD_LL, keyboardCallback, IntPtr.Zero, 0);
            if (keyboardHook == IntPtr.Zero)
                throw new InvalidOperationException("Windows could not install the scoped Ctrl+H shortcut hook.");
            destroyHook = Native.SetWinEventHook(Native.EVENT_OBJECT_DESTROY, Native.EVENT_OBJECT_DESTROY,
                IntPtr.Zero, eventCallback, 0, 0, Native.WINEVENT_OUTOFCONTEXT);
            if (destroyHook == IntPtr.Zero)
            {
                Dispose();
                throw new InvalidOperationException("Windows could not monitor the attached window lifetime.");
            }
        }

        internal bool IsInstalled { get { return keyboardHook != IntPtr.Zero && destroyHook != IntPtr.Zero && !disposed; } }

        private IntPtr OnKeyboard(int code, IntPtr wParam, IntPtr lParam)
        {
            try
            {
                if (code < 0 || disposed) return Native.CallNextHookEx(keyboardHook, code, wParam, lParam);
                int message = wParam.ToInt32();
                bool keyDown = message == Native.WM_KEYDOWN || message == Native.WM_SYSKEYDOWN;
                bool keyUp = message == Native.WM_KEYUP || message == Native.WM_SYSKEYUP;
                if (!keyDown && !keyUp) return Native.CallNextHookEx(keyboardHook, code, wParam, lParam);

                Native.KBDLLHOOKSTRUCT key = (Native.KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.KBDLLHOOKSTRUCT));
                if (key.vkCode != Native.VK_H) return Native.CallNextHookEx(keyboardHook, code, wParam, lParam);

                bool targetForeground = keyDown && Native.GetForegroundWindow() == lease.Handle;
                bool controlDown = keyDown && (Native.GetAsyncKeyState(Native.VK_CONTROL) & 0x8000) != 0;
                bool otherModifierDown = keyDown && (
                    (Native.GetAsyncKeyState(Native.VK_MENU) & 0x8000) != 0 ||
                    (Native.GetAsyncKeyState(Native.VK_SHIFT) & 0x8000) != 0 ||
                    (Native.GetAsyncKeyState(Native.VK_LWIN) & 0x8000) != 0 ||
                    (Native.GetAsyncKeyState(Native.VK_RWIN) & 0x8000) != 0);
                bool queueHide;
                bool suppress = shortcutState.Process(keyDown, controlDown, otherModifierDown, targetForeground, out queueHide);
                if (queueHide)
                {
                    try
                    {
                        queueHideTarget(delegate
                        {
                            try
                            {
                                if (disposed) return;
                                if (Native.GetForegroundWindow() != lease.Handle) return;
                                if (!lease.Validate()) { Dispose(); targetLost(); return; }
                                hideTarget();
                            }
                            catch { }
                        });
                    }
                    catch { }
                }
                return suppress ? new IntPtr(1) : Native.CallNextHookEx(keyboardHook, code, wParam, lParam);
            }
            catch { return Native.CallNextHookEx(keyboardHook, code, wParam, lParam); }
        }

        private void OnWinEvent(IntPtr hook, uint eventType, IntPtr hwnd, int objectId, int childId, uint eventThread, uint eventTime)
        {
            try
            {
                if (disposed || eventType != Native.EVENT_OBJECT_DESTROY || hwnd != lease.Handle || objectId != 0 || childId != 0) return;
                Dispose();
                targetLost();
            }
            catch { }
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            if (keyboardHook != IntPtr.Zero) { Native.UnhookWindowsHookEx(keyboardHook); keyboardHook = IntPtr.Zero; }
            if (destroyHook != IntPtr.Zero) { Native.UnhookWinEvent(destroyHook); destroyHook = IntPtr.Zero; }
        }
    }

    internal sealed class ScopedShortcutState
    {
        private bool suppressUntilKeyUp;

        internal bool Process(bool keyDown, bool controlDown, bool otherModifierDown, bool targetForeground, out bool queueHide)
        {
            queueHide = false;
            if (!keyDown)
            {
                if (!suppressUntilKeyUp) return false;
                suppressUntilKeyUp = false;
                return true;
            }
            if (suppressUntilKeyUp) return true;
            if (!controlDown || otherModifierDown || !targetForeground) return false;
            suppressUntilKeyUp = true;
            queueHide = true;
            return true;
        }
    }

    internal static class SelfTest
    {
        internal static int Run(string reportPath)
        {
            var results = new List<string>();
            Form dummy = new Form();
            dummy.Text = "Chrome host prototype self-test dummy";
            dummy.StartPosition = FormStartPosition.Manual;
            dummy.Location = new Point(120, 120);
            dummy.Size = new Size(420, 280);
            dummy.Show();
            Native.ShowWindow(dummy.Handle, Native.SW_SHOW);
            Application.DoEvents();
            WindowLease lease = null;
            try
            {
                Rectangle originalBounds = dummy.Bounds;
                long originalStyle = Native.GetWindowLongPtr(dummy.Handle, Native.GWL_EXSTYLE).ToInt64();
                bool originalVisible = Native.IsWindowVisible(dummy.Handle);
                if (!originalVisible)
                    throw new InvalidOperationException("The self-test dummy did not meet the visible-window precondition.");
                lease = new WindowLeaseForTest(dummy).CreateLease();
                lease.SetOpacity(65);
                AssertAlpha(dummy.Handle, 166);
                lease.SetOpacity(100); AssertAlpha(dummy.Handle, 255);
                lease.SetOpacity(15); AssertAlpha(dummy.Handle, 38);
                lease.SetOpacity(65); AssertAlpha(dummy.Handle, 166);
                results.Add("opacity 15%, 65%, and 100% native alpha readback: PASS");
                lease.MoveBy(40, 40);
                if (dummy.Left != originalBounds.Left + 40 || dummy.Top != originalBounds.Top + 40)
                    throw new InvalidOperationException("Move self-test failed.");
                results.Add("move by 40 pixels: PASS");
                lease.SetTopmost(true);
                if ((Native.GetWindowLongPtr(dummy.Handle, Native.GWL_EXSTYLE).ToInt64() & Native.WS_EX_TOPMOST) == 0)
                    throw new InvalidOperationException("Topmost self-test failed.");
                results.Add("topmost style: PASS");
                lease.SetVisible(false);
                if (Native.IsWindowVisible(dummy.Handle)) throw new InvalidOperationException("Hide self-test failed.");
                lease.SetVisible(true);
                if (!Native.IsWindowVisible(dummy.Handle)) throw new InvalidOperationException("Show self-test failed.");
                results.Add("hide and show: PASS");
                lease.Restore();
                Application.DoEvents();
                long restoredStyle = Native.GetWindowLongPtr(dummy.Handle, Native.GWL_EXSTYLE).ToInt64();
                bool visibleRestored = Native.IsWindowVisible(dummy.Handle) == originalVisible;
                if (dummy.Bounds != originalBounds || restoredStyle != originalStyle || !visibleRestored)
                    throw new InvalidOperationException("Restore mismatch. Bounds=" + dummy.Bounds + ", expected=" + originalBounds + ", style=" + restoredStyle.ToString("X") + ", expectedStyle=" + originalStyle.ToString("X") + ", visible=" + visibleRestored);
                results.Add("restore style, bounds, and visibility: PASS");
            }
            catch (Exception ex) { results.Add("FAIL: " + ex.Message); }
            finally { dummy.Close(); dummy.Dispose(); }
            try
            {
                Form layeredDummy = new Form();
                layeredDummy.Text = "Chrome host layered opacity self-test dummy";
                layeredDummy.StartPosition = FormStartPosition.Manual;
                layeredDummy.Location = new Point(180, 180);
                layeredDummy.Size = new Size(320, 200);
                layeredDummy.Show();
                Application.DoEvents();
                try
                {
                    IntPtr layeredHwnd = layeredDummy.Handle;
                    long style = Native.GetWindowLongPtr(layeredHwnd, Native.GWL_EXSTYLE).ToInt64();
                    Native.SetWindowLongPtr(layeredHwnd, Native.GWL_EXSTYLE, new IntPtr(style | Native.WS_EX_LAYERED));
                    if (!Native.SetLayeredWindowAttributes(layeredHwnd, 0, 128, Native.LWA_ALPHA))
                        throw new InvalidOperationException("Could not prepare layered-alpha dummy.");
                    WindowLease layeredLease = new WindowLeaseForTest(layeredDummy).CreateLease();
                    if (layeredLease.OriginalOpacity != 50)
                        throw new InvalidOperationException("Alpha 128 did not map to 50 percent display.");
                    layeredLease.SetOpacity(65);
                    AssertAlpha(layeredHwnd, 166);
                    layeredLease.Restore();
                    AssertAlpha(layeredHwnd, 128);
                    results.Add("pre-layered alpha 128 displays 50% and restores exact alpha: PASS");
                }
                finally { layeredDummy.Close(); layeredDummy.Dispose(); }
            }
            catch (Exception ex) { results.Add("FAIL: " + ex.Message); }
            RunScopedShortcutTests(results);
            RunLaunchConfigurationTests(results);
            RunProcessIdentityTests(results);
            bool passed = results.Count == 11;
            foreach (string result in results)
                if (result.StartsWith("FAIL:", StringComparison.Ordinal)) passed = false;
            string output = "Chrome host prototype self-test 0.1.2\r\n" + string.Join("\r\n", results.ToArray()) + "\r\n" + (passed ? "RESULT: PASS" : "RESULT: FAIL") + "\r\n";
            if (!string.IsNullOrEmpty(reportPath)) File.WriteAllText(reportPath, output, new UTF8Encoding(false));
            Console.Write(output);
            return passed ? 0 : 1;
        }

        private sealed class WindowLeaseForTest
        {
            private readonly Form form;
            internal WindowLeaseForTest(Form target) { form = target; }
            internal WindowLease CreateLease() { return new WindowLease(form.Handle, true); }
        }

        private static void RunScopedShortcutTests(List<string> results)
        {
            Form dummy = new Form();
            dummy.Text = "Chrome host scoped-shortcut self-test dummy";
            dummy.StartPosition = FormStartPosition.Manual;
            dummy.Location = new Point(220, 220);
            dummy.Size = new Size(320, 200);
            dummy.Show();
            Application.DoEvents();
            ScopedShortcutController shortcuts = null;
            ScopedShortcutController lostShortcuts = null;
            Form lostDummy = null;
            WindowLease lease = null;
            try
            {
                lease = new WindowLeaseForTest(dummy).CreateLease();
                ScopedShortcutState state = new ScopedShortcutState();
                bool queueHide;
                int hideCount = 0;
                bool targetShortcut = state.Process(true, true, false, true, out queueHide);
                if (targetShortcut && queueHide) hideCount++;
                bool heldRepeatAfterFocusChange = state.Process(true, true, false, false, out queueHide);
                if (queueHide) hideCount++;
                bool matchingKeyUp = state.Process(false, false, false, false, out queueHide);
                bool unrelatedChord = state.Process(true, true, false, false, out queueHide);
                bool modifiedChord = state.Process(true, true, true, true, out queueHide);
                bool missingControl = state.Process(true, false, false, true, out queueHide);
                if (!targetShortcut || !heldRepeatAfterFocusChange || !matchingKeyUp || unrelatedChord || modifiedChord || missingControl || hideCount != 1)
                    throw new InvalidOperationException("Scoped shortcut decision test failed.");
                results.Add("Ctrl+H state handles target chord, repeats, keyup, and modifiers: PASS");

                shortcuts = new ScopedShortcutController(lease, delegate { lease.SetVisible(false); }, delegate(Action action) { action(); }, delegate { });
                if (!shortcuts.IsInstalled) throw new InvalidOperationException("Scoped hooks did not install.");
                shortcuts.Dispose();
                if (shortcuts.IsInstalled) throw new InvalidOperationException("Scoped hooks remained installed after disposal.");
                lostDummy = new Form();
                lostDummy.Text = "Chrome host target-loss self-test dummy";
                lostDummy.Show();
                Application.DoEvents();
                WindowLease lostLease = new WindowLeaseForTest(lostDummy).CreateLease();
                bool targetLost = false;
                lostShortcuts = new ScopedShortcutController(lostLease, delegate { }, delegate(Action action) { action(); }, delegate { targetLost = true; });
                lostDummy.Close();
                Stopwatch lossWait = Stopwatch.StartNew();
                while (!targetLost && lossWait.ElapsedMilliseconds < 1000)
                {
                    Application.DoEvents();
                    Thread.Sleep(10);
                }
                bool lostHooksReleased = targetLost && !lostShortcuts.IsInstalled;
                lostShortcuts.Dispose();
                lostShortcuts = null;
                lostDummy.Dispose();
                lostDummy = null;
                if (!lostHooksReleased) throw new InvalidOperationException("Target destruction did not release the scoped hooks.");
                results.Add("keyboard and target-lifetime hooks install and clean up: PASS");

                lease.SetVisible(false);
                if (Native.IsWindowVisible(dummy.Handle)) throw new InvalidOperationException("Dummy hide failed.");
                lease.SetVisible(true);
                if (!Native.IsWindowVisible(dummy.Handle)) throw new InvalidOperationException("Dummy Show recovery failed.");
                lease.Restore();
                if (!Native.IsWindowVisible(dummy.Handle)) throw new InvalidOperationException("Dummy restore failed.");
                results.Add("hidden target recovers through Show and restores: PASS");
            }
            catch (Exception ex) { results.Add("FAIL: scoped shortcut self-test: " + ex.Message); }
            finally
            {
                if (shortcuts != null) shortcuts.Dispose();
                if (lostShortcuts != null) lostShortcuts.Dispose();
                if (lostDummy != null) { lostDummy.Close(); lostDummy.Dispose(); }
                dummy.Close();
                dummy.Dispose();
            }
        }

        private static void AssertAlpha(IntPtr hwnd, byte expected)
        {
            byte actual; uint colorKey, flags;
            if (!Native.GetLayeredWindowAttributes(hwnd, out colorKey, out actual, out flags) ||
                actual != expected || (flags & Native.LWA_ALPHA) == 0)
                throw new InvalidOperationException("Expected native alpha " + expected + ", received " + actual + ".");
        }

        private static void RunLaunchConfigurationTests(List<string> results)
        {
            try
            {
                string localAppData = Path.Combine(Path.GetTempPath(), "Glance Profile Test");
                string dedicated = ChromeLaunchConfiguration.GetDedicatedProfilePath(localAppData);
                string regular = Path.Combine(Path.GetFullPath(localAppData), "Google", "Chrome", "User Data");
                string expectedArguments = "--user-data-dir=\"" + dedicated + "\" --app=" + ChromeLaunchConfiguration.GeminiUrl + " --new-window";
                if (!Path.IsPathRooted(dedicated) ||
                    !string.Equals(dedicated, Path.GetFullPath(Path.Combine(localAppData, "GlanceAI", "BrowserProfile")), StringComparison.OrdinalIgnoreCase) ||
                    ChromeLaunchConfiguration.PathsOverlap(dedicated, regular) ||
                    !string.Equals(ChromeLaunchConfiguration.BuildArguments(localAppData), expectedArguments, StringComparison.Ordinal))
                    throw new InvalidOperationException("Dedicated profile path or Chrome argument validation failed.");
                results.Add("dedicated profile path and three Chrome launch switches: PASS");
            }
            catch (Exception ex) { results.Add("FAIL: launch configuration self-test: " + ex.Message); }
        }

        private static void RunProcessIdentityTests(List<string> results)
        {
            try
            {
                string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
                ChromeProcessIdentity launched = new ChromeProcessIdentity(4321, "chrome", chromePath, 638972000000000000L);
                bool exactMatch = launched.MatchesIdentity(4321, "chrome", chromePath, 638972000000000000L);
                bool differentChromePid = launched.MatchesIdentity(9876, "chrome", chromePath, 638972000000000000L);
                bool reusedPid = launched.MatchesIdentity(4321, "chrome", chromePath, 638972000000000001L);
                bool differentExecutable = launched.MatchesIdentity(4321, "chrome", @"C:\Other\chrome.exe", 638972000000000000L);
                ChromeProcessIdentity exited = new ChromeProcessIdentity(int.MaxValue, "chrome", chromePath, 638972000000000000L);
                if (!exactMatch || differentChromePid || reusedPid || differentExecutable || exited.IsCurrentIdentity())
                    throw new InvalidOperationException("Chrome process ownership fixture test failed.");
                results.Add("window ownership rejects other Chrome PID, PID reuse, and exited process: PASS");
            }
            catch (Exception ex) { results.Add("FAIL: process identity self-test: " + ex.Message); }
        }
    }

    internal static class Native
    {
        internal const int WH_KEYBOARD_LL = 13;
        internal const int VK_H = 0x48;
        internal const int VK_CONTROL = 0x11;
        internal const int VK_SHIFT = 0x10;
        internal const int VK_MENU = 0x12;
        internal const int VK_LWIN = 0x5B;
        internal const int VK_RWIN = 0x5C;
        internal const int WM_KEYDOWN = 0x0100;
        internal const int WM_KEYUP = 0x0101;
        internal const int WM_SYSKEYDOWN = 0x0104;
        internal const int WM_SYSKEYUP = 0x0105;
        internal const uint EVENT_OBJECT_DESTROY = 0x8001;
        internal const uint WINEVENT_OUTOFCONTEXT = 0x0000;
        internal const int GWL_EXSTYLE = -20;
        internal const long WS_EX_TOPMOST = 0x00000008L;
        internal const long WS_EX_LAYERED = 0x00080000L;
        internal const uint LWA_ALPHA = 0x2;
        internal const uint LWA_COLORKEY = 0x1;
        internal const uint GW_OWNER = 4;
        internal const uint SWP_NOSIZE = 0x1;
        internal const uint SWP_NOMOVE = 0x2;
        internal const uint SWP_NOZORDER = 0x4;
        internal const uint SWP_NOACTIVATE = 0x10;
        internal const uint SWP_NOOWNERZORDER = 0x200;
        internal const int SW_HIDE = 0;
        internal const int SW_SHOW = 5;
        internal static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        internal static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);

        [StructLayout(LayoutKind.Sequential)] internal struct RECT { internal int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] internal struct POINT { internal int X, Y; }
        [StructLayout(LayoutKind.Sequential)] internal struct WINDOWPLACEMENT
        {
            internal int length, flags, showCmd;
            internal POINT ptMinPosition, ptMaxPosition;
            internal RECT rcNormalPosition;
        }

        internal delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
        internal delegate IntPtr LowLevelKeyboardProc(int code, IntPtr wParam, IntPtr lParam);
        internal delegate void WinEventProc(IntPtr hook, uint eventType, IntPtr hwnd, int objectId, int childId, uint eventThread, uint eventTime);
        [StructLayout(LayoutKind.Sequential)] internal struct KBDLLHOOKSTRUCT { internal uint vkCode, scanCode, flags, time; internal IntPtr extraInfo; }
        [DllImport("user32.dll", SetLastError = true)] internal static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc callback, IntPtr module, uint threadId);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] internal static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int virtualKey);
        [DllImport("user32.dll", SetLastError = true)] internal static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr module, WinEventProc callback, uint processId, uint threadId, uint flags);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool UnhookWinEvent(IntPtr hook);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
        [DllImport("user32.dll")] internal static extern bool IsWindow(IntPtr hwnd);
        [DllImport("user32.dll")] internal static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")] internal static extern IntPtr GetWindow(IntPtr hwnd, uint command);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder className, int maxCount);
        internal static string GetClassName(IntPtr hwnd) { var b = new StringBuilder(256); return GetClassName(hwnd, b, b.Capacity) > 0 ? b.ToString() : string.Empty; }
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)] private static extern IntPtr GetWindowLongPtr64(IntPtr hwnd, int index);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)] private static extern IntPtr GetWindowLong32(IntPtr hwnd, int index);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] private static extern IntPtr SetWindowLongPtr64(IntPtr hwnd, int index, IntPtr value);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)] private static extern IntPtr SetWindowLong32(IntPtr hwnd, int index, IntPtr value);
        internal static IntPtr GetWindowLongPtr(IntPtr hwnd, int index) { return IntPtr.Size == 8 ? GetWindowLongPtr64(hwnd, index) : GetWindowLong32(hwnd, index); }
        internal static IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value) { return IntPtr.Size == 8 ? SetWindowLongPtr64(hwnd, index, value) : SetWindowLong32(hwnd, index, value); }
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint colorKey, byte alpha, uint flags);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool GetLayeredWindowAttributes(IntPtr hwnd, out uint colorKey, out byte alpha, out uint flags);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
        [DllImport("user32.dll")] internal static extern bool ShowWindow(IntPtr hwnd, int command);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool GetWindowPlacement(IntPtr hwnd, ref WINDOWPLACEMENT placement);
        [DllImport("user32.dll", SetLastError = true)] internal static extern bool SetWindowPlacement(IntPtr hwnd, ref WINDOWPLACEMENT placement);
        [DllImport("kernel32.dll")] internal static extern void SetLastError(uint errorCode);
    }
}
