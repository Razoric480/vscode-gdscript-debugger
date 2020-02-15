import path = require("path");
import fs = require("fs");
import * as vscode from "vscode";
import cp = require("child_process");
import net = require("net");
import { VariantParser } from "./VariantParser";
import * as commands from "./Commands/Commands";
import {
    WorkspaceFolder,
    DebugConfiguration,
    ProviderResult,
    CancellationToken
} from "vscode";
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
    // #region Public Methods (1)

    public resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        config: DebugConfiguration,
        token?: CancellationToken
    ): ProviderResult<DebugConfiguration> {
        if (!config.type && !config.request && !config.name) {
        }

        return config;
    }

    // #endregion Public Methods (1)
}

class GodotDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    // #region Properties (1)

    private session: GodotDebugSession | undefined;

    // #endregion Properties (1)

    // #region Public Methods (2)

    public createDebugAdapterDescriptor(
        session: vscode.DebugSession
    ): ProviderResult<vscode.DebugAdapterDescriptor> {
        this.session = new GodotDebugSession();
        return new vscode.DebugAdapterInlineImplementation(this.session);
    }

    public dispose() {
        this.session = undefined;
    }

    // #endregion Public Methods (2)
}
