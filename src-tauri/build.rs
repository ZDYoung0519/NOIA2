fn main() {
    #[cfg(target_os = "windows")]
    {
        copy_windivert_runtime();

        use tauri_build::WindowsAttributes;

        let windows = WindowsAttributes::new().app_manifest(
            r#"
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
    "#,
        );

        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
            .expect("Failed to run build script");
    }

    #[cfg(not(target_os = "windows"))]
    {
        tauri_build::build()
    }
}

#[cfg(target_os = "windows")]
fn copy_windivert_runtime() {
    use std::path::PathBuf;

    println!("cargo:rerun-if-changed=resources/windivert/WinDivert.dll");
    println!("cargo:rerun-if-changed=resources/windivert/WinDivert64.sys");

    let out_dir = PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR is set"));
    let profile_dir = out_dir
        .ancestors()
        .nth(3)
        .expect("resolve Cargo profile directory");
    let source_dir = PathBuf::from("resources/windivert");

    for output_dir in [profile_dir.to_path_buf(), profile_dir.join("deps")] {
        std::fs::create_dir_all(&output_dir).expect("create Cargo output directory");
        for file_name in ["WinDivert.dll", "WinDivert64.sys"] {
            std::fs::copy(source_dir.join(file_name), output_dir.join(file_name))
                .unwrap_or_else(|error| panic!("copy {file_name} to Cargo output: {error}"));
        }
    }
}
