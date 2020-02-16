const terminate = require("terminate");
import { EventEmitter } from "events";
import net = require("net");
import cp = require("child_process");
import path = require("path");
import { VariantParser } from "../VariantParser";
import * as commands from "./Commands";
import vscode = require("vscode");
import { GodotCommands } from "./GodotCommands";
import { CommandBuilder } from "./CommandBuilder";
import { GodotBreakpoint, GodotStackFrame } from "../godotDebugRuntime";

export class ServerController {
    // #region Properties (11)

    private builder: CommandBuilder | undefined;
    private connection: net.Socket | undefined;
    private emitter: EventEmitter;
    private godotCommands: GodotCommands | undefined;
    private godotPid: number | undefined;
    private outputChannel: vscode.OutputChannel | undefined;
    private parser: VariantParser | undefined;
    private scopeCallbacks: ((
        stackLevel: number,
        stackFiles: string[],
        scopes: {
            locals: { name: string; value: any }[];
            members: { name: string; value: any }[];
            globals: { name: string; value: any }[];
        }
    ) => void)[] = [];
    private server: net.Server | undefined;
    private stackFiles: string[] = [];
    private stackLevel = 0;

    // #endregion Properties (11)

    // #region Constructors (1)

    constructor(
        eventEmitter: EventEmitter,
        outputChannel?: vscode.OutputChannel
    ) {
        this.emitter = eventEmitter;
        this.outputChannel = outputChannel;
    }

    // #endregion Constructors (1)

    // #region Public Methods (9)

    public break() {
        this.godotCommands?.sendBreakCommand();
    }

    public continue() {
        this.godotCommands?.sendContinueCommand();
    }

    public getScope(
        level: number,
        callback?: (
            stackLevel: number,
            stackFiles: string[],
            scopes: {
                locals: { name: string; value: any }[];
                members: { name: string; value: any }[];
                globals: { name: string; value: any }[];
            }
        ) => void
    ) {
        this.godotCommands?.sendStackFrameVarsCommand(level);
        this.stackLevel = level;
        if (callback) {
            this.scopeCallbacks.push(callback);
        }
    }

    public next() {
        this.godotCommands?.sendNextCommand();
    }

    public removeBreakpoint(pathTo: string, line: number) {
        this.godotCommands?.sendRemoveBreakpointCommand(pathTo, line);
    }

    public setBreakpoint(pathTo: string, line: number) {
        this.godotCommands?.sendSetBreakpointCommand(pathTo, line);
    }

    public start(
        projectPath: string,
        port: number,
        address: string,
        breakpoints: GodotBreakpoint[]
    ) {
        this.builder = new CommandBuilder();
        this.parser = new VariantParser();
        this.godotCommands = new GodotCommands(this.builder, this.parser);

        this.builder.registerCommand(
            new commands.Command("debug_enter", params => {
                if (params[1] === "Breakpoint" || params[0]) {
                    this.godotCommands?.sendStackDumpCommand();
                }
            })
        );

        this.builder.registerCommand(
            new commands.Command("stack_dump", params => {
                let frames: Map<string, any>[] = params;
                this.triggerBreakpoint(
                    frames.map(sf => {
                        return {
                            id: sf.get("id"),
                            file: sf.get("file"),
                            function: sf.get("function"),
                            line: sf.get("line")
                        };
                    })
                );
            })
        );

        this.builder.registerCommand(
            new commands.Command("output", params => {
                params.forEach(line => {
                    this.outputChannel?.appendLine(line);
                });
            })
        );

        this.builder.registerCommand(
            new commands.Command("error", params => {
                params.forEach(param => {});
            })
        );

        this.builder.registerCommand(
            new commands.Command("performance", params => {})
        );

        this.builder.registerCommand(
            new commands.Command("message:inspect_object", params => {})
        );

        this.builder.registerCommand(
            new commands.Command("stack_frame_vars", params => {
                let locals: any[] = [];
                let members: any[] = [];
                let globals: any[] = [];

                let localCount = (params[0] as number) * 2;
                let memberCount = params[1 + localCount] * 2;
                let globalCount = params[2 + localCount + memberCount] * 2;

                if (localCount > 0) {
                    locals = params.slice(1, 1 + localCount);
                }
                if (memberCount > 0) {
                    members = params.slice(
                        2 + localCount,
                        2 + localCount + memberCount
                    );
                }
                if (globalCount > 0) {
                    globals = params.slice(
                        3 + localCount + memberCount,
                        3 + localCount + memberCount + globalCount
                    );
                }

                this.pumpScope(
                    {
                        locals: locals,
                        members: members,
                        globals: globals
                    },
                    projectPath
                );
            })
        );

        this.server = net.createServer(connection => {
            this.connection = connection;
            this.godotCommands?.setConnection(connection);

            connection.on("data", buffer => {
                if (!this.parser || !this.builder) {
                    return;
                }

                let len = buffer.byteLength;
                let offset = 0;
                do {
                    let data = this.parser.getBufferDataSet(buffer, offset);
                    let dataOffset = data[0] as number;
                    offset += dataOffset;
                    len -= dataOffset;
                    this.builder.parseData(data.slice(1));
                } while (len > 0);
            });

            connection.on("close", hadError => {
                if (hadError) {
                    this.sendEvent("terminated");
                }
            });

            connection.on("end", () => {
                this.sendEvent("terminated");
            });

            connection.on("error", error => {
                console.error(error);
            });

            connection.on("drain", () => {
                connection.resume();
                this.godotCommands?.setCanWrite(true);
            });
        });

        this.server?.listen(port, address);

        let godotExec = cp.exec(
            `godot --path ${projectPath} --remote-debug ${address}:${port}
             ${this.buildBreakpointString(breakpoints, projectPath)}`
        );
        this.godotPid = godotExec.pid;
    }

    public step() {
        this.godotCommands?.sendStepCommand();
    }

    public stop() {
        this.connection?.end(() => {
            this.server?.close();
            terminate(this.godotPid, (error: string | undefined) => {
                if (error) {
                    console.error(error);
                }
            });
        });
        this.sendEvent("terminated");
    }

    // #endregion Public Methods (9)

    // #region Private Methods (4)

    private buildBreakpointString(
        breakpoints: GodotBreakpoint[],
        project: string
    ): string {
        let output = "";
        if (breakpoints.length > 0) {
            output += " --breakpoints ";

            breakpoints.forEach(bp => {
                let relativePath = path
                    .relative(project, bp.file)
                    .replace(/\\/g, "/");
                if (relativePath.length !== 0) {
                    output += `res://${relativePath}:${bp.line},`;
                }
            });
            output = output.slice(0, -1);
        }

        return output;
    }

    private pumpScope(
        scopes: {
            locals: any[];
            members: any[];
            globals: any[];
        },
        projectPath: string
    ) {
        if (this.scopeCallbacks.length > 0) {
            let cb = this.scopeCallbacks.shift();
            if (cb) {
                let stackFiles = this.stackFiles.map(sf => {
                    return sf.replace("res://", `${projectPath}/`);
                });
                cb(this.stackLevel, stackFiles, scopes);
            }
        }
    }

    private sendEvent(event: string, ...args: any[]) {
        setImmediate(_ => {
            this.emitter.emit(event, ...args);
        });
    }

    private triggerBreakpoint(stackFrames: GodotStackFrame[]) {
        this.stackFiles = stackFrames.map(sf => {
            return sf.file;
        });
        this.sendEvent("stopOnBreakpoint", stackFrames);
    }

    // #endregion Private Methods (4)
}
