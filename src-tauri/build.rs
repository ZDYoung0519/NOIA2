fn main() {
    #[cfg(target_os = "windows")]
    {
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
