import * as vscode from "vscode";
import cp = require("child_process");
import net = require("net");
import * as dp from "./GDScript/DebugParser";
import { CommandBuilder } from "./Commands/CommandBuilder";
import { DebugEnterCommand } from "./Commands/DebugEnterCommand";
import { OutputCommand } from "./Commands/OutputCommand";

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "extension.helloWorld",
        () => {
            var server = net.createServer(connection => {
                let handleDebugEnter = new DebugEnterCommand(parameters => {
                    vscode.window.showInformationMessage(
                        `Broke (reason: ${parameters[2]}) ${
                            parameters[1] ? "Can" : "Cannot"
                        } continue.`
                    );
				});
				
				let handleOutput = new OutputCommand((parameters => {
					let outputMessageCount = parameters[0];
					console.log(`${parameters.slice(1)}`);
				}));

                let builder = new CommandBuilder();
				builder.registerCommand(handleDebugEnter);
				builder.registerCommand(handleOutput);

                vscode.window.showInformationMessage("Debugger connected");

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

export function deactivate() {}
