// fn main() {
//   tauri_build::build()
// }
 
// 修改后
fn main() {
  #[cfg(target_os = "windows")]
  { // windows系统执行当前代码可以设置为管理员权限，但注意：
    // npm run tauri dev/build 时需要打开 "管理员：命令提示符"执行命令
    // 负责会提示： Caused by: 请求的操作需要提升。 (os error 740)
    use tauri_build::WindowsAttributes;
    let mut windows = WindowsAttributes::new();
    windows = windows.app_manifest(r#"
    <assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
        <dependency>
            <dependentAssembly>
                <assemblyIdentity
                    type="win32"
                    name="Microsoft.Windows.Common-Controls"
                    version="6.0.0.0"
                    processorArchitecture="*"
                    publicKeyToken="6595b64144ccf1df"
                    language="*"
                />
            </dependentAssembly>
        </dependency>
        <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
            <security>
                <requestedPrivileges>
                    <requestedExecutionLevel
                        level="requireAdministrator"
                        uiAccess="false"
                    />
                </requestedPrivileges>
            </security>
        </trustInfo>
    </assembly>
    "#);
 
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("Failed to run build script");
  }
  #[cfg(not(target_os = "windows"))]
  {
    // 非Windows系统使用标准构建配置
    tauri_build::build()
  }
 
}