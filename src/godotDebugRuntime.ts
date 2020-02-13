import { readFileSync } from "fs";
import { EventEmitter } from "events";

export interface GodotBreakpoint {
    id: number;
    line: number;
    file: string;
}

export class GodotDebugRuntime extends EventEmitter {
    private address = "127.0.0.1";
    private port = 6007;
    private project = "";
    
    constructor() {
        super();
    }
    
    public start(project: string, address: string, port: number) {
        this.project = project;
        this.address = address;
        this.port = port;
    }
    
    public continue(reverse = false) {
        
    }
    
    public step(reverse = false, event = 'stopOnStep') {
        
    }
    
    public stack(startFrame: number, endFrame: number): any {
        
    }
    
    public getBreakPoints(path: string, line: number): number[] {
        return [];
    }
    
    public setBreakPoint(path: string, line: number): GodotBreakpoint {
        return { file: "", line: 1, id: 1 };
    }
    
    public clearBreakPoint(path: string, line: number): GodotBreakpoint | undefined {
        return undefined;
    }
    
    public clearBreakpoints(path: string): void {
        
    }
    
    public setDataBreakpoint(address: string): boolean {
        return false;
    }
    
    public clearAllDataBreakpoints(): void {
        
    }
    
    private run(reverse = false, stepEvent?: string) {
        
    }
    
    private sendEvent(event: string, ... args: any[]) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }
}
