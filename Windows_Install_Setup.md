# Java 21 Setup for VS Code Extensions

## Step 1: Download Java 21

1. **Download an official Java JDK 21:**
   - Such as one of the following trusted sources:
     - [Eclipse Adoptium (Temurin)](https://adoptium.net/)
     - [Microsoft Build of OpenJDK 21](https://learn.microsoft.com/en-us/java/openjdk/download#openjdk-21)
2. **Configure your download:**
   - **Version:** Select **21 - LTS** (Long Term Support)
   - **Operating System:** Select **Windows**
   - **Architecture:** Select **x64**
3. **Click the Download button** to get the `.msi` installer

## Step 2: Install Java 21

⚠️ **CRITICAL:** Pay attention to the installation options below!

1. **Run the downloaded `.msi` installer**
2. **During installation, MAKE SURE to check these options:**
   - ✅ **"Add to PATH"** - This allows VS Code to find Java
   - ✅ **"Set JAVA_HOME variable"** - This sets the required environment variable
3. **Complete the installation** by clicking through the remaining steps

## Step 3: Verify Java Installation

1. **Open a new PowerShell window**
2. **Run the following command:**
   ```bash
   java -version
   ```
3. **You should see output similar to:**
   ```
   openjdk version "21.0.x" 2024-xx-xx
   OpenJDK Runtime Environment Temurin-21.0.x+x (build 21.0.x+x)
   OpenJDK 64-Bit Server VM Temurin-21.0.x+x (build 21.0.x+x, mixed mode, sharing)
   ```
   4. **Check that Java is in your PATH:**  
      Open PowerShell and run:
      ```powershell
      where.exe java
      ```
      **Expected output:**  
      ```
      C:\Program Files\Eclipse Adoptium\jdk-21.x.x-hotspot\bin\java.exe
      ```
      If you see a path similar to the above, Java is correctly added to your system PATH.

## Step 4: Configure VS Code

### Method 2: Manual Configuration

1. **Open VS Code**
2. **Press `Ctrl+,` to open Settings**
3. **Search for:** `java.jdt.ls.java.home`
4. **Set the value to your Java 21 installation path:**
   ```
      C:\\Program Files\\Eclipse Adoptium\\jdk-21.x.x-hotspot
   ```
   *(Replace `x.x` with your actual version numbers)*  
   *(The double backslashes `\\` are required to escape the single backslash `\` in Windows file paths when entering them in VS Code settings JSON.)*

### Method 2: Using VS Code's Java Runtime Configuration

1. **Open VS Code**
2. **Press `Ctrl+Shift+P` to open Command Palette**
3. **Type:** `Java: Configure Java Runtime`
4. **See any error outputs**

## Step 5: Verify Everything Works

1. **Restart VS Code completely**
2. **Try using the extension**
3. **The extension should now work without errors**

## Troubleshooting

### If you get "Java runtime does not meet minimum required version"
- Make sure you installed Java **21**, not Java 11 or 17
- Verify with `java -version` that Java 21 is active
- Restart VS Code after installation

### If VS Code still can't find Java
- Check that you selected "Add to PATH" during installation
- Manually add Java to your system PATH if needed
- Set the `java.jdt.ls.java.home` setting in VS Code as shown above

## Common Error Messages Fixed

- ✅ `Starting client failed: Launching server using command ... undefined\bin\java failed`
- ✅ `Java runtime does not meet the minimum required version of '21'`
- ✅ `Java is not installed or not found in PATH`

---

**Note:** You can have multiple Java versions installed simultaneously. VS Code will use Java 21 for extensions that require it, while other projects can use different Java versions as needed.