import * as vscode from "vscode";
import cp = require("child_process");
import net = require("net");
import * as dp from "./GDScript/DebugParser";
import * as commands from "./Commands/Commands";

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "extension.helloWorld",
        () => {
            var server = net.createServer(connection => {
                let handleDebugEnter = new commands.Command(
                    "debug_enter",
                    parameters => {
                        let buffer = createSendCommand("get_stack_dump");
                        connection.write(buffer, err => {
                            console.log(err);
                        });
                    }
                );

                let handleOutput = new commands.Command(
                    "output",
                    parameters => {
                        vscode.window.showInformationMessage(
                            `Output ${parameters[0]} messages.`
                        );
                        console.log("output");
                    }
                );

                let handleError = new commands.Command("error", parameters => {
                    console.log("errors");
                });

                let handleMessage = new commands.Command(
                    "message:?",
                    parameters => {
                        console.log("message");
                    }
                );

                let handleStackDump = new commands.Command(
                    "stack_dump",
                    parameters => {
                        console.log("stackDump");
                    }
                );

                let builder = new commands.CommandBuilder();
                builder.registerCommand(handleDebugEnter);
                builder.registerCommand(handleOutput);
                builder.registerCommand(handleError);
                builder.registerCommand(handleMessage);
                builder.registerCommand(handleStackDump);

                vscode.window.showInformationMessage("Debugger connected");
                console.log("Debugger connected");

                connection.on("data", buffer => {
                    let model = dp.getBufferModel(buffer);
                    let dataset = dp.getBufferDataSet(model);
                    builder.parseData(dataset);
                });

                connection.on("close", hadError => {
                    console.log(
                        "Connection closed" + (hadError ? " with errors." : "")
                    );
                });

                connection.on("connect", () => {
                    console.log("Connection established");
                });

                connection.on("drain", () => {
                    console.log("Drained");
                });

                connection.on("end", () => {
                    console.log("Connection ended");
                });

                connection.on("error", error => {
                    console.log("Error: " + error);
                });

                connection.on("lookup", (error, address, family, host) => {
                    console.log(
                        "Lookup: " +
                            error +
                            ", " +
                            address +
                            ", " +
                            family +
                            ", " +
                            host
                    );
                });
            });

            server.listen(4598, "127.0.0.1");

            cp.exec(
                "godot.exe --path E:/Projects/Studies/godot-minimap-demo/project --remote-debug 127.0.0.1:4598 --breakpoints res://src/Player.gd:25"
            );
        }
    );

    context.subscriptions.push(disposable);
}

export function createSendCommand(command: string, parameters?: any[]): Buffer {
    let commandArray: any[] = [];
    commandArray.push(command);
    parameters?.forEach(param => {
        commandArray.push(param);
    });

    let buffer = Buffer.alloc(0);
    let model: dp.BufferModel = {
        buffer: buffer,
        offset: 0,
        len: 0
    };

    dp.encodeVariant(commandArray, model);
    return model.buffer;
}

export function deactivate() {}
