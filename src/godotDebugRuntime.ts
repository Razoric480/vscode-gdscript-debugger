import { readFileSync } from "fs";
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

export interface GodotStackframe {
    // #region Properties (4)

    file: string;
    function: string;
    id: number;
    line: number;

    // #endregion Properties (4)
}

export class GodotDebugRuntime extends EventEmitter {
    // #region Properties (16)

    private static FUNCTION_REGEX = /^[^#]*?func[ \t]+?/;
    private static INDENTED_REGEX = /^[ \t]+?/;
    private static ONREADY_REGEX = /^[^#]*?onready[ \t]+?var/;

    private address = "127.0.0.1";
    private breakpointId = 0;
    private breakpoints = new Map<string, GodotBreakpoint[]>();
    private broke = false;
    private brokenBp: GodotBreakpoint | undefined;
    private brokenReason = "";
    private builder = new commands.CommandBuilder();
    private canContinue = true;
    private connection: net.Socket | undefined;
    private parser = new VariantParser();
    private port = 6007;
    private project = "";
    private sourceLines = new Map<string, string[]>();
    private godotCommands: GodotCommands | undefined;

    private out: vscode.OutputChannel | undefined;

    // #endregion Properties (16)

    // #region Constructors (1)

    constructor() {
        super();
    }

    // #endregion Constructors (1)

    // #region Public Methods (12)

    public clearBreakPoint(
        path: string,
        line: number
    ): GodotBreakpoint | undefined {
        let bps = this.breakpoints.get(path);
        if (bps) {
            const index = bps.findIndex(bp => bp.line === line);
            if (index >= 0) {
                const bp = bps[index];
                bps.slice(index, 1);
                return bp;
            }
        }

        return undefined;
    }

    public clearBreakpoints(path: string): void {
        this.breakpoints.delete(path);
    }

    public continue() {
        this.sendEvent("continue");
    }

    public finish() {
        if (this.connection) {
            this.connection.end();
        }
    }

    public getBreakPoints(path: string, line: number): number[] {
        return [];
    }

    public getProject(): string {
        return this.project;
    }

    public setBreakPoint(pathTo: string, line: number): GodotBreakpoint {
        const bp = {
            verified: false,
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

        this.verifyBreakpoints(bp.file);

        return bp;
    }

    public stack(startFrame: number, endFrame: number): any {}

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
                this.canContinue = params[0] as boolean;
                this.broke = true;
                this.brokenReason = params[1] as string;
                if (params[1] === "Breakpoint") {
                    // this.godotCommands?.sendStackDumpCommand();
                    this.godotCommands?.sendGetScopesCommand(0);
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
                let breakthishere = 10;
            })
        );

        let server = net.createServer(connection => {
            this.godotCommands = new GodotCommands(
                this.builder,
                this.parser,
                connection
            );

            //----- Server responses -----

            connection.on("data", buffer => {
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

            connection.on("close", hadError => {});

            connection.on("end", () => {});

            connection.on("error", error => {
                console.error(error);
            });

            connection.on("drain", () => {
                connection.resume();
                this.godotCommands?.setCanWrite(true);
            });
        });

        server.listen(this.port, this.address);

        cp.exec(
            `godot --path ${project} --remote-debug ${address}:${port} ${this.buildBreakpointString()}`
        );
    }

    public step() {
        this.sendEvent("step");
    }

    public triggerBreakpoint(stackFrames: GodotStackframe[]) {
        this.sendEvent("stopOnBreakpoint", stackFrames);
    }

    // #endregion Public Methods (12)

    // #region Private Methods (7)

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
                            output += `res://${relativePath}:${bp.line + 1},`;
                        }
                    });
                }
            });
            output = output.slice(0, -1);
        }

        return output;
    }

    private isIndented(line: string): boolean {
        let match = line.match(GodotDebugRuntime.INDENTED_REGEX);
        if (match && match.length > 0) {
            return true;
        }
        return false;
    }

    private isOnReady(line: string): boolean {
        let match = line.match(GodotDebugRuntime.ONREADY_REGEX);
        if (match && match.length > 0) {
            return true;
        }
        return false;
    }

    private loadSource(file: string) {
        let source = this.sourceLines.get(file);
        if (!source) {
            let sourceLines: string[] = readFileSync(file)
                .toString()
                .split("\n");
            this.sourceLines.set(file, sourceLines);
        }
    }

    private seeksBackToFunction(path: string, line: number): boolean {
        let source = this.sourceLines.get(path);
        let newNumber = -1;
        if (source) {
            let count = line - 1;
            let rsource = source.slice(0, count).reverse();

            rsource.forEach(l => {
                let match = l.match(GodotDebugRuntime.FUNCTION_REGEX);
                if (match && match.length > 0) {
                    newNumber = count;
                    return;
                }
                count--;
            });
        }

        return newNumber !== -1;
    }

    private sendEvent(event: string, ...args: any[]) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }

    private verifyBreakpoints(path: string): void {
        let bps = this.breakpoints.get(path);
        if (bps) {
            this.loadSource(path);
            let source = this.sourceLines.get(path);

            bps.forEach(bp => {
                if (source) {
                    if (!bp.verified && bp.line < source.length) {
                        const line = source[bp.line];
                        const trimmed = line.trim();
                        if (
                            trimmed.length !== 0 &&
                            ((this.isIndented(line) &&
                                this.seeksBackToFunction(path, bp.line)) ||
                                this.isOnReady(line))
                        ) {
                            bp.verified = true;
                            this.sendEvent("breakpointValidated", bp);
                        }
                    }
                }
            });
        }
    }

    // #endregion Private Methods (7)
}
