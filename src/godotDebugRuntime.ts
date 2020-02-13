import { readFileSync } from "fs";
import { EventEmitter } from "events";

export interface GodotBreakpoint {
    verified: boolean;
    id: number;
    line: number;
    file: string;
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

    constructor() {
        super();
    }

    public start(project: string, address: string, port: number) {
        this.project = project;
        this.address = address;
        this.port = port;
    }

    public continue(reverse = false) {}

    public step(reverse = false, event = "stopOnStep") {}

    public stack(startFrame: number, endFrame: number): any {}

    public getBreakPoints(path: string, line: number): number[] {
        return [];
    }

    public setBreakPoint(path: string, line: number): GodotBreakpoint {
        const bp = {
            verified: false,
            file: path,
            line: 1,
            id: this.breakpointId++
        };

        let bps = this.breakpoints.get(path);
        if (!bps) {
            bps = new Array<GodotBreakpoint>();
            this.breakpoints.set(path, bps);
        }

        bps.push(bp);

        this.verifyBreakpoints(path);

        return bp;
    }

    public clearBreakPoint(
        path: string,
        line: number
    ): GodotBreakpoint | undefined {
        return undefined;
    }

    public clearBreakpoints(path: string): void {}

    private run(reverse = false, stepEvent?: string) {}

    private verifyBreakpoints(path: string): void {
        let bps = this.breakpoints.get(path);
        if (bps) {
            this.loadSource(path);
            let source = this.sourceLines.get(path);

            bps.forEach(bp => {
                if (source) {
                    if (!bp.verified && bp.line < source.length) {
                        const line = source[bp.line];
                        if (
                            line.length !== 0 &&
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
}
