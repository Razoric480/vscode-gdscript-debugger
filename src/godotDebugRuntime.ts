import { readFileSync } from "fs";
import { EventEmitter } from "events";
import net = require("net");
import cp = require("child_process");
import path = require("path");
import { VariantParser } from "./VariantParser";
import * as commands from "./Commands/Commands";
import vscode = require("vscode");

export interface GodotBreakpoint {
    verified: boolean;
    id: number;
    line: number;
    file: string;
    source?: string;
}

export class GodotDebugRuntime extends EventEmitter {
    private static ONREADY_REGEX = /^[^#]*?onready[ \t]+?var/;
    private static INDENTED_REGEX = /^[ \t]+?/;
    private static FUNCTION_REGEX = /^[^#]*?func[ \t]+?/;

    private address = "127.0.0.1";
    private port = 6007;
    private project = "";
    private breakpointId = 0;
    private breakpoints = new Map<string, GodotBreakpoint[]>();
    private sourceLines = new Map<string, string[]>();
    private parser = new VariantParser();
    private builder = new commands.CommandBuilder();
    private canContinue = true;
    private broke = false;
    private brokenReason = "";
    private brokenBp: GodotBreakpoint | undefined;
    private connection: net.Socket | undefined;

    constructor() {
        super();
    }

    public start(project: string, address: string, port: number) {
        this.project = project.replace(/\\/g, "/");
        if(this.project.match(/^[a-zA-Z]:\//)) {
            this.project = this.project[0].toLowerCase() + this.project.slice(1);
        }
        this.address = address;
        this.port = port;

        this.builder.registerCommand(
            new commands.Command("debug_enter", params => {
                this.canContinue = params[0];
                this.broke = true;
                this.brokenReason = params[1];
                if (params[1] === "Breakpoint") {
                    this.godotBreakpointAnnounced();
                }
            })
        );

        this.builder.registerCommand(
            new commands.Command("stack_dump", params => {
                this.triggerBreakpoint(
                    params[0].get("file"),
                    params[0].get("line"),
                    params[0].get("id"),
                    params[0].get("function")
                );
            })
        );

        this.builder.registerCommand(
            new commands.Command("output", params => {})
        );

        this.builder.registerCommand(
            new commands.Command("error", params => {})
        );

        this.builder.registerCommand(
            new commands.Command("performance", params => {})
        );

        let server = net.createServer(connection => {
            this.connection = connection;

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
            });
        });

        server.listen(this.port, this.address);

        cp.exec(
            `godot --path ${project} --remote-debug ${address}:${port} ${this.buildBreakpointString()}`
        );
    }

    public godotBreakpointAnnounced() {
        if (this.connection) {
            let buffer = this.builder.createBufferedCommand(
                "get_stack_dump",
                this.parser
            );

            let drained = this.connection.write(buffer);
            if (!drained) {
                this.connection.pause();
            }
        }
    }

    public triggerBreakpoint(
        file: string,
        line: number,
        id: number,
        func: string
    ) {
        let clientFile = `${this.project}/${file.replace("res://", "")}`;
        let bps = this.breakpoints.get(clientFile);
        if (bps) {
            let bp: GodotBreakpoint | undefined;
            bps.forEach(fbp => {
                if (fbp.id === id && fbp.line === line - 1) {
                    bp = fbp;
                    return;
                }
            });
            if (bp) {
                this.brokenBp = bp;
                this.sendEvent("stopOnBreakpoint", bp);
            }
        }
    }

    public continue() {
        this.sendEvent("continue");
    }

    public step() {
        this.sendEvent("step");
    }

    public stack(startFrame: number, endFrame: number): any {}

    public getBreakPoints(path: string, line: number): number[] {
        return [];
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

    private isOnReady(line: string): boolean {
        let match = line.match(GodotDebugRuntime.ONREADY_REGEX);
        if (match && match.length > 0) {
            return true;
        }
        return false;
    }

    private isIndented(line: string): boolean {
        let match = line.match(GodotDebugRuntime.INDENTED_REGEX);
        if (match && match.length > 0) {
            return true;
        }
        return false;
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

    private loadSource(file: string) {
        let source = this.sourceLines.get(file);
        if (!source) {
            let sourceLines: string[] = readFileSync(file)
                .toString()
                .split("\n");
            this.sourceLines.set(file, sourceLines);
        }
    }

    private sendEvent(event: string, ...args: any[]) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }

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
}
