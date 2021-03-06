import * as vscode from "vscode";
import { GodotDebugSession } from "./godotDebug";

export function activate(context: vscode.ExtensionContext) {
    const provider = new GodotConfigurationProvider();
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider("godot", provider)
    );

    let factory = new GodotDebugAdapterFactory();
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory("godot", factory)
    );

    context.subscriptions.push(factory);
}

export function deactivate() {}

class GodotConfigurationProvider implements vscode.DebugConfigurationProvider {
    public resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        if (!config.type && !config.request && !config.name) {
            //TODO: default launch profile
        }

        return config;
    }
}

class GodotDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    private session: GodotDebugSession | undefined;

    public createDebugAdapterDescriptor(
        session: vscode.DebugSession
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        this.session = new GodotDebugSession();
        return new vscode.DebugAdapterInlineImplementation(this.session);
    }

    public dispose() {
        this.session = undefined;
    }
}
