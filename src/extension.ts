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

    // let disposable = vscode.commands.registerCommand(
    //     "extension.debugGodot",
    //     () => {
    //         let channel = vscode.window.createOutputChannel("Godot");
    //         channel.show();

    //         var server = net.createServer(connection => {
    //             let handleDebugEnter = new commands.Command(
    //                 "debug_enter",
    //                 parameters => {
    //                     let buffer = builder.createBufferedCommand(
    //                         "get_stack_dump",
    //                         parser
    //                     );
    //                     let test = connection.write(buffer);

    //                     channel.appendLine(
    //                         test ? "Output fully" : "Not output fully"
    //                     );
    //                 }
    //             );

    //             let handleOutput = new commands.Command(
    //                 "output",
    //                 parameters => {
    //                     vscode.window.showInformationMessage(
    //                         `Output ${parameters[0]} messages.`
    //                     );
    //                     console.log("output");
    //                 }
    //             );

    //             let handleError = new commands.Command("error", parameters => {
    //                 console.log("errors");
    //             });

    //             let handleMessage = new commands.Command(
    //                 "message:?",
    //                 parameters => {
    //                     console.log("message");
    //                 }
    //             );

    //             let handleStackDump = new commands.Command(
    //                 "stack_dump",
    //                 parameters => {
    //                     channel.appendLine("Stack dump?");
    //                 }
    //             );

    //             let builder = new commands.CommandBuilder();
    //             builder.registerCommand(handleDebugEnter);
    //             builder.registerCommand(handleOutput);
    //             builder.registerCommand(handleError);
    //             builder.registerCommand(handleMessage);
    //             builder.registerCommand(handleStackDump);

    //             let parser = new VariantParser();

    //             connection.on("data", buffer => {
    //                 let len = buffer.byteLength;
    //                 let offset = 0;
    //                 do {
    //                     let dataset = parser.getBufferDataSet(buffer, offset);
    //                     offset += dataset[0] as number;
    //                     len -= offset;
    //                     builder.parseData(dataset.slice(1));
    //                 } while (len > 0);
    //             });

    //             connection.on("close", hadError => {
    //                 channel.appendLine(
    //                     `Connection closed ${hadError ? " with errors." : ""}`
    //                 );
    //             });

    //             connection.on("connect", () => {
    //                 channel.appendLine(`Debugger connected`);
    //             });

    //             connection.on("drain", () => {
    //                 channel.appendLine(`Drained`);
    //             });

    //             connection.on("end", () => {
    //                 channel.appendLine(`Connection ended`);
    //             });

    //             connection.on("error", error => {
    //                 channel.appendLine(`Error: ${error}`);
    //             });

    //             connection.on("lookup", (error, address, family, host) => {
    //                 channel.appendLine(
    //                     `Lookup: ${error}, "${address}, ${family}, ${host}`
    //                 );
    //             });
    //         });

    //         server.listen(4598, "127.0.0.1");

    //         cp.exec(
    //             "godot.exe --path E:/Projects/Studies/godot-minimap-demo/project --remote-debug 127.0.0.1:4598 --breakpoints res://src/Player.gd:25"
    //         );
    //     }
    // );

    // context.subscriptions.push(disposable);
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
    createDebugAdapterDescriptor(
        session: vscode.DebugSession
    ): ProviderResult<vscode.DebugAdapterDescriptor> {
        return new vscode.DebugAdapterInlineImplementation(
            new GodotDebugSession()
        );
    }
}
