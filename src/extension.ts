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
}

export function deactivate() {}

class GodotConfigurationProvider implements vscode.DebugConfigurationProvider {
    resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        config: DebugConfiguration,
        token?: CancellationToken
    ): ProviderResult<DebugConfiguration> {
        if(!config.type && !config.request && !config.name) {
            
        }
        
        return config;
    }
}

class GodotDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
    private session: GodotDebugSession | undefined;
    
    createDebugAdapterDescriptor(
        session: vscode.DebugSession
    ): ProviderResult<vscode.DebugAdapterDescriptor> {
        this.session = new GodotDebugSession();
        return new vscode.DebugAdapterInlineImplementation(
            this.session
        );
    }
}
