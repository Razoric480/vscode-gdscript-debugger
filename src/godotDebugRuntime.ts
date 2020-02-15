const terminate = require("terminate");
import { EventEmitter } from "events";
import net = require("net");
import cp = require("child_process");
import path = require("path");
import { VariantParser } from "./VariantParser";
import * as commands from "./Commands/Commands";
import vscode = require("vscode");
import { GodotCommands } from "./Commands/GodotCommands";

export interface GodotBreakpoint {
    // #region Properties (4)

    file: string;
    id: number;
    line: number;
    verified: boolean;

    // #endregion Properties (4)
}

export interface GodotStackFrame {
    // #region Properties (4)

    file: string;
    function: string;
    id: number;
    line: number;

    // #endregion Properties (4)
}

export class GodotDebugRuntime extends EventEmitter {
    // #region Properties (13)

    private address = "127.0.0.1";
    private breakpointId = 0;
    private breakpoints = new Map<string, GodotBreakpoint[]>();
    private builder = new commands.CommandBuilder();
    private commandParser = new VariantParser();
    private connection: net.Socket | undefined;
    private godotCommands = new GodotCommands(this.builder, this.commandParser);
    private godotExec: cp.ChildProcess | undefined;
    private out: vscode.OutputChannel | undefined;
    private paused = false;
    private port = 6007;
    private project = "";
    private server: net.Server | undefined;
    private scopeCallbacks: ((scopes: {
        locals: any[];
        members: any[];
        globals: any[];
    }) => void)[] = [];

    // #endregion Properties (13)

    // #region Constructors (1)

    constructor() {
        super();
    }

    // #endregion Constructors (1)

    // #region Public Methods (14)

    public break() {
        if (this.paused) {
            this.godotCommands.sendContinueCommand();
        } else {
            this.godotCommands.sendBreakCommand();
        }
    }

    public continue() {
        this.godotCommands.sendContinueCommand();
    }

    public getBreakPoints(path: string): GodotBreakpoint[] {
        let bps = this.breakpoints.get(path);
        return bps ? bps : [];
    }

    public getProject(): string {
        return this.project;
    }

    public getScope(
        level: number,
        callback?: (scopes: {
            locals: any[];
            members: any[];
            globals: any[];
        }) => void
    ) {
        this.godotCommands.sendGetScopesCommand(level);
        if (callback) {
            this.scopeCallbacks.push(callback);
        }
    }

    public next() {
        this.godotCommands.sendStepCommand();
    }

    public removeBreakpoint(pathTo: string, line: number) {
        let bps = this.breakpoints.get(pathTo);
        if (bps) {
            let index = bps.findIndex((bp, i) => {
                return bp.line === line;
            });
            if (index !== -1) {
                let bp = bps[index];
                bps.splice(index, 1);
                this.breakpoints.set(pathTo, bps);
                this.godotCommands.sendRemoveBreakpointCommand(
                    bp.file.replace(new RegExp(`${this.project}/`), "res://"),
                    bp.line
                );
            }
        }
    }

    public setBreakPoint(pathTo: string, line: number): GodotBreakpoint {
        const bp = {
            verified: true,
            file: pathTo.replace(/\\/g, "/"),
            line: line,
            id: this.breakpointId++
        };

        let bps = this.breakpoints.get(bp.file);
        if (!bps) {
            bps = new Array<GodotBreakpoint>();
            this.breakpoints.set(bp.file, bps);
        }

        bps.push(bp);

        this.sendEvent("breakpointValidated", bp);

        if (bp.verified) {
            this.godotCommands.sendSetBreakpointCommand(
                bp.file.replace(new RegExp(`${this.project}/`), "res://"),
                line
            );
        }

        return bp;
    }

    public start(project: string, address: string, port: number) {
        this.out = vscode.window.createOutputChannel("Godot");
        this.out.show();

        this.project = project.replace(/\\/g, "/");
        if (this.project.match(/^[a-zA-Z]:\//)) {
            this.project =
                this.project[0].toLowerCase() + this.project.slice(1);
        }
        this.address = address;
        this.port = port;

        this.builder.registerCommand(
            new commands.Command("debug_enter", params => {
                if (params[1] === "Breakpoint" || params[0]) {
                    this.godotCommands.sendStackDumpCommand();
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
                    this.out?.appendLine(line);
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

                this.pumpScope({
                    locals: locals,
                    members: members,
                    globals: globals
                });
            })
        );

        this.server = net.createServer(connection => {
            this.connection = connection;
            this.godotCommands.setConnection(connection);

            connection.on("data", buffer => {
                let len = buffer.byteLength;
                let offset = 0;
                do {
                    let data = this.commandParser.getBufferDataSet(
                        buffer,
                        offset
                    );
                    let dataOffset = data[0] as number;
                    offset += dataOffset;
                    len -= dataOffset;
                    this.builder.parseData(data.slice(1));
                } while (len > 0);
            });

            connection.on("close", hadError => {
                if (hadError) {
                    console.log("Errored out");
                } else {
                    console.log("closed");
                }
                connection.destroy();
            });

            connection.on("end", () => {});

            connection.on("error", error => {
                console.error(error);
            });

            connection.on("drain", () => {
                connection.resume();
                this.godotCommands.setCanWrite(true);
            });
        });

        this.server?.listen(this.port, this.address);

        this.godotExec = cp.exec(
            `godot --path ${project} --remote-debug ${address}:${port} ${this.buildBreakpointString()}`
        );
    }

    public step() {
        this.godotCommands.sendNextCommand();
    }

    public terminate() {
        this.connection?.end(() => {
            this.server?.close();
            terminate(this.godotExec?.pid, (error: string | undefined) => {
                if (error) {
                    console.log(error);
                } else {
                    console.log("Debug end");
                }
            });
        });
        this.sendEvent("terminated", false);
    }

    public triggerBreakpoint(stackFrames: GodotStackFrame[]) {
        this.sendEvent("stopOnBreakpoint", stackFrames);
    }

    // #endregion Public Methods (14)

    // #region Private Methods (3)

    private buildBreakpointString(): string {
        let output = "";
        if (this.breakpoints.size > 0) {
            output += " --breakpoints ";

            Array.from(this.breakpoints.keys()).forEach(f => {
                let bps = this.breakpoints.get(f);
                if (bps) {
                    bps.forEach(bp => {
                        let relativePath = path
                            .relative(this.project, bp.file)
                            .replace(/\\/g, "/");
                        if (relativePath.length !== 0) {
                            output += `res://${relativePath}:${bp.line},`;
                        }
                    });
                }
            });
            output = output.slice(0, -1);
        }

        return output;
    }

    private pumpScope(scopes: {
        locals: any[];
        members: any[];
        globals: any[];
    }) {
        if (this.scopeCallbacks.length > 0) {
            let cb = this.scopeCallbacks.shift();
            if (cb) {
                cb(scopes);
            }
        }
    }

    private sendEvent(event: string, ...args: any[]) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }

    // #endregion Private Methods (3)
}
