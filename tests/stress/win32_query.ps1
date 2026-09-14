param([string]$HwndStr)

$code = @"
using System;
using System.Runtime.InteropServices;
public class Win32Helper {
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
    public static extern int GetWindowLong32(IntPtr hWnd, int nIndex);
    public static long GetWindowLong(IntPtr hWnd, int nIndex) {
        if (IntPtr.Size == 8) {
            return GetWindowLongPtr64(hWnd, nIndex).ToInt64();
        } else {
            return GetWindowLong32(hWnd, nIndex);
        }
    }
    [DllImport("user32.dll")]
    public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint pdwAffinity);
}
"@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
$hwnd = [IntPtr]::new([long]$HwndStr)
$exStyle = [Win32Helper]::GetWindowLong($hwnd, -20)
$affinity = 0
$res = [Win32Helper]::GetWindowDisplayAffinity($hwnd, [ref]$affinity)
[PSCustomObject]@{
    ExStyle = $exStyle
    Affinity = $affinity
    AffinitySuccess = $res
} | ConvertTo-Json
