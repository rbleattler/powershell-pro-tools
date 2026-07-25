'use strict';
import * as vscode from 'vscode';
import path = require("path");
import fs = require("fs");
import { Container } from '../container';
import { load } from '../settings';

function makeDefaultPackageConfig(rootPath: string) {

    const settings = load();
    const outputPath = path.join(rootPath, 'out')

    if (settings.defaultPackagePsd1 && settings.defaultPackagePsd1 !== '') {
        const buffer = fs.readFileSync(settings.defaultPackagePsd1);
        var defaultPackageManifest = buffer.toString();
        defaultPackageManifest = defaultPackageManifest.replace('$root', vscode.window.activeTextEditor.document.fileName);
        return defaultPackageManifest.replace('$outputPath', outputPath);
    }
    else {
        return `@{
    Root = '${vscode.window.activeTextEditor.document.fileName}'
    OutputPath = '${outputPath}'
    Package = @{
        Enabled = $true
        Obfuscate = $false
        HideConsoleWindow = $false
        DotNetVersion = 'v4.6.2'
        FileVersion = '1.0.0'
        FileDescription = ''
        ProductName = ''
        ProductVersion = ''
        Copyright = ''
        RequireElevation = $false
        ApplicationIconPath = ''
        PackageType = 'Console'
    }
    Bundle = @{
        Enabled = $true
        Modules = $true
        # IgnoredModules = @()
    }
}
        `
    }
}

function getPackageRoot(packageManifest: string): string | undefined {
    const packageConfig = fs.readFileSync(packageManifest, 'utf8');
    const rootMatch = packageConfig.match(/^\s*Root\s*=\s*(['\"])(.*?)\1\s*(?:#.*)?$/m);
    return rootMatch ? rootMatch[2] : undefined;
}

function updatePackageRoot(packageManifest: string, scriptPath: string): boolean {
    const packageConfig = fs.readFileSync(packageManifest, 'utf8');
    const updatedPackageConfig = packageConfig.replace(
        /^(\s*Root\s*=\s*)(['\"])(.*?)\2(\s*(?:#.*)?)$/m,
        `$1'${scriptPath.replace(/'/g, "''")}'$4`);

    if (updatedPackageConfig === packageConfig) {
        return false;
    }

    fs.writeFileSync(packageManifest, updatedPackageConfig);
    return true;
}

function samePath(firstPath: string, secondPath: string): boolean {
    return path.resolve(firstPath).toLowerCase() === path.resolve(secondPath).toLowerCase();
}

export function packageAsExe() {
    return vscode.commands.registerCommand('powershell.packageAsExe', async (resource) => {
        if (!Container.IsInitialized()) return;

        var rootPath;

        if (!vscode.workspace.workspaceFolders && vscode.window.activeTextEditor) {
            rootPath = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
        }
        else if (resource) {
            rootPath = path.dirname(resource.fsPath);

            var files = fs.readdirSync(rootPath);
            var file = files.find(x => {
                return path.basename(x).toLowerCase() === "package.psd1";
            });

            if (!file) {
                if (vscode.workspace.workspaceFolders) {
                    rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
                }
            }
        }
        else if (vscode.workspace.workspaceFolders) {
            rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
        else {
            vscode.window.showWarningMessage("Open a PS1 file before packaging.");
            return;
        }

        var files = fs.readdirSync(rootPath);
        var file = files.find(x => {
            return path.basename(x).toLowerCase() === "package.psd1";
        });

        var packageManifest = path.join(rootPath, 'package.psd1')
        if (file == null) {
            if (!vscode.window.activeTextEditor) {
                vscode.window.showWarningMessage("Open a file to package.");
                return;
            }

            if (!vscode.window.activeTextEditor.document.uri.fsPath.toLowerCase().endsWith(".ps1")) {
                vscode.window.showWarningMessage("Open a PS1 file to package.");
                return;
            }

            const defaultPackageConfig = makeDefaultPackageConfig(rootPath);
            fs.writeFileSync(packageManifest, defaultPackageConfig);
            vscode.window.showInformationMessage(`Created default package manifest at ${packageManifest} `);
        }

        const activeEditor = vscode.window.activeTextEditor;
        const packageRoot = getPackageRoot(packageManifest);
        if (activeEditor && packageRoot && activeEditor.document.uri.fsPath.toLowerCase().endsWith('.ps1')) {
            const activeScriptPath = activeEditor.document.uri.fsPath;
            const packageRootPath = path.isAbsolute(packageRoot)
                ? packageRoot
                : path.join(path.dirname(packageManifest), packageRoot);

            if (!samePath(packageRootPath, activeScriptPath)) {
                const useManifestRoot = `Use package manifest root (${packageRoot})`;
                const useActiveScript = `Use active script (${path.basename(activeScriptPath)})`;
                const selection = await vscode.window.showQuickPick([useManifestRoot, useActiveScript], {
                    placeHolder: 'The package manifest targets a different script. Which script should be packaged?'
                });

                if (!selection) {
                    return;
                }

                if (selection === useActiveScript && !updatePackageRoot(packageManifest, activeScriptPath)) {
                    vscode.window.showWarningMessage(`Unable to update the Root value in ${packageManifest}.`);
                    return;
                }
            }
        }

        Container.PowerShellService.Package(packageManifest);
    });
}
