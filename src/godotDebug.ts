import {
    LoggingDebugSession,
    InitializedEvent,
    TerminatedEvent,
    StoppedEvent,
    Thread,
    Source,
    Breakpoint
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import { GodotDebugRuntime, GodotStackFrame } from "./godotDebugRuntime";
const { Subject } = require("await-notify");
import fs = require("fs");
import { VariableScope } from "./VariableScope";

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    address: string;
    port: number;
    project: string;
}

export class GodotDebugSession extends LoggingDebugSession {
    private static THREAD_ID = 1;

    private configurationDone = new Subject();
    private inspectCallback: (() => void) | undefined;
    private inspectCount = 0;
    private lastFrames: GodotStackFrame[] = [];
    private runtime: GodotDebugRuntime;
    private scopeId = 1;
    private scopes = new Map<string, VariableScope[]>();

    public constructor() {
        super();

        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        this.runtime = new GodotDebugRuntime();

        this.runtime.on("stopOnBreakpoint", frames => {
            this.lastFrames = frames;
            this.sendEvent(
                new StoppedEvent("breakpoint", GodotDebugSession.THREAD_ID)
            );
        });

        this.runtime.on("terminated", () => {
            this.sendEvent(new TerminatedEvent(false));
        });
    }

    protected configurationDoneRequest(
        response: DebugProtocol.ConfigurationDoneResponse,
        args: DebugProtocol.ConfigurationDoneArguments
    ): void {
        super.configurationDoneRequest(response, args);

        this.configurationDone.notify();
    }

    protected continueRequest(
        response: DebugProtocol.ContinueResponse,
        args: DebugProtocol.ContinueArguments
    ): void {
        response.body = {
            allThreadsContinued: true
        };

        this.runtime.continue();

        this.sendResponse(response);
    }

    protected initializeRequest(
        response: DebugProtocol.InitializeResponse,
        args: DebugProtocol.InitializeRequestArguments
    ): void {
        response.body = response.body || {};

        response.body.supportsConfigurationDoneRequest = true;

        response.body.supportsEvaluateForHovers = false;

        response.body.supportsStepBack = false;
        response.body.supportsGotoTargetsRequest = false;

        response.body.supportsCancelRequest = false;

        response.body.supportsCompletionsRequest = false;

        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsDataBreakpoints = false;
        response.body.supportsBreakpointLocationsRequest = false;
        response.body.supportsConditionalBreakpoints = false;
        response.body.supportsHitConditionalBreakpoints = false;

        response.body.supportsLogPoints = false;

        response.body.supportsModulesRequest = false;

        response.body.supportsReadMemoryRequest = false;

        response.body.supportsRestartFrame = false;
        response.body.supportsRestartRequest = false;

        response.body.supportsSetExpression = false;

        response.body.supportsSetVariable = false;
        response.body.supportsStepInTargetsRequest = false;

        response.body.supportsTerminateThreadsRequest = false;
        response.body.supportsTerminateRequest = true;

        this.sendResponse(response);

        this.sendEvent(new InitializedEvent());
    }

    protected async launchRequest(
        response: DebugProtocol.LaunchResponse,
        args: LaunchRequestArguments
    ) {
        await this.configurationDone.wait(1000);
        this.runtime.start(args.project, args.address, args.port);
        this.sendResponse(response);
    }

    protected nextRequest(
        response: DebugProtocol.NextResponse,
        args: DebugProtocol.NextArguments
    ): void {
        this.runtime.step();
        this.sendResponse(response);
    }

    protected pauseRequest(
        response: DebugProtocol.PauseResponse,
        args: DebugProtocol.PauseArguments,
        request?: DebugProtocol.PauseRequest
    ): void {
        this.runtime.break();
        this.sendResponse(response);
    }

    protected scopesRequest(
        response: DebugProtocol.ScopesResponse,
        args: DebugProtocol.ScopesArguments
    ): void {
        this.runtime.getScope(
            args.frameId,
            (stackLevel, stackFiles, scopes) => {
                let file = stackFiles[stackLevel];
                let fileScopes = this.scopes.get(file);

                fileScopes = [];

                let localScope = new VariableScope(this.scopeId++);
                let memberScope = new VariableScope(this.scopeId++);
                let globalScope = new VariableScope(this.scopeId++);

                fileScopes.push(localScope);
                fileScopes.push(memberScope);
                fileScopes.push(globalScope);

                this.scopes.set(file, fileScopes);

                let outLocalScope: DebugProtocol.Scope = {
                    name: "Locals",
                    namedVariables: scopes.locals.length / 2,
                    presentationHint: "locals",
                    expensive: false,
                    variablesReference: localScope.id
                };

                for (let i = 0; i < scopes.locals.length; i += 2) {
                    const name = scopes.locals[i];
                    const value = scopes.locals[i + 1];

                    this.drillScope(localScope, { name: name, value: value });
                }

                let outMemberScope: DebugProtocol.Scope = {
                    name: "Members",
                    namedVariables: scopes.members.length / 2,
                    presentationHint: "locals",
                    expensive: false,
                    variablesReference: memberScope.id
                };

                for (let i = 0; i < scopes.members.length; i += 2) {
                    const name = scopes.members[i];
                    const value = scopes.members[i + 1];

                    this.drillScope(memberScope, { name: name, value: value });
                }

                let outGlobalScope: DebugProtocol.Scope = {
                    name: "Globals",
                    namedVariables: scopes.globals.length / 2,
                    presentationHint: "locals",
                    expensive: false,
                    variablesReference: globalScope.id
                };

                for (let i = 0; i < scopes.globals.length; i += 2) {
                    const name = scopes.globals[i];
                    const value = scopes.globals[i + 1];

                    this.drillScope(globalScope, { name: name, value: value });
                }

                response.body = {
                    scopes: [outLocalScope, outMemberScope, outGlobalScope]
                };

                if (this.inspectCount === 0) {
                    this.sendResponse(response);
                } else {
                    this.inspectCallback = () => {
                        this.sendResponse(response);
                    };
                }
            }
        );
    }

    protected setBreakPointsRequest(
        response: DebugProtocol.SetBreakpointsResponse,
        args: DebugProtocol.SetBreakpointsArguments
    ): void {
        const path = (args.source.path as string).replace(/\\/g, "/");
        const clientLines = args.lines || [];

        if (fs.existsSync(path)) {
            let bps = this.runtime.getBreakPoints(path);
            let bpLines = bps.map(bp => bp.line);

            bps.forEach(bp => {
                if (clientLines.indexOf(bp.line) === -1) {
                    this.runtime.removeBreakpoint(path, bp.line);
                }
            });
            clientLines.forEach(l => {
                if (bpLines.indexOf(l) === -1) {
                    this.runtime.setBreakPoint(path, l);
                }
            });

            bps = this.runtime.getBreakPoints(path);

            response.body = {
                breakpoints: bps.map(bp => {
                    return new Breakpoint(
                        true,
                        bp.line,
                        1,
                        new Source(
                            bp.file.split("/").reverse()[0],
                            bp.file,
                            bp.id
                        )
                    );
                })
            };

            this.sendResponse(response);
        }
    }

    protected stackTraceRequest(
        response: DebugProtocol.StackTraceResponse,
        args: DebugProtocol.StackTraceArguments
    ): void {
        if (this.lastFrames) {
            response.body = {
                totalFrames: this.lastFrames.length,
                stackFrames: this.lastFrames.map(sf => {
                    return {
                        id: sf.id,
                        name: sf.function,
                        line: sf.line,
                        column: 1,
                        source: new Source(
                            sf.file,
                            `${this.runtime.getProject()}/${sf.file.replace(
                                "res://",
                                ""
                            )}`
                        )
                    };
                })
            };
        }
        this.sendResponse(response);
    }

    protected stepInRequest(
        response: DebugProtocol.StepInResponse,
        args: DebugProtocol.StepInArguments
    ) {
        this.runtime.step();
        this.sendResponse(response);
    }

    protected terminateRequest(
        response: DebugProtocol.TerminateResponse,
        args: DebugProtocol.TerminateArguments
    ) {
        this.runtime.terminate();
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [new Thread(GodotDebugSession.THREAD_ID, "thread_1")]
        };
        this.sendResponse(response);
    }

    protected async variablesRequest(
        response: DebugProtocol.VariablesResponse,
        args: DebugProtocol.VariablesArguments,
        request?: DebugProtocol.Request
    ) {
        let outId = args.variablesReference;
        let files = Array.from(this.scopes.keys());

        let outScopeObject = this.getVariableScope(files, outId);
        let isScope = outScopeObject.isScope;
        let outScope = outScopeObject.scope;

        if (outScope) {
            if (isScope) {
                let varIds = outScope.getVariableIds();
                response.body = {
                    variables: this.parseScope(varIds, outScope)
                };
            } else {
                let variable = outScope.getVariable(outId);
                if (variable) {
                    let subVariables = outScope.getSubVariablesFor(outId);
                    if (subVariables) {
                        let ids = outScope.getVariableIds();
                        let pathTo = variable.name;
                        response.body = {
                            variables: []
                        };

                        if (args.filter === "indexed") {
                            let count = args.count || 0;
                            for (let i = 0; i < count; i++) {
                                let name = `${pathTo}.${i}`;
                                let idIndex = ids.findIndex(id => {
                                    let variable = outScope?.getVariable(id);
                                    return variable && name === variable.name;
                                });

                                response.body.variables.push(
                                    this.getVariableResponse(
                                        name,
                                        variable.value[i],
                                        ids[idIndex]
                                    )
                                );
                            }
                        } else {
                            subVariables.forEach(sv => {
                                let name = sv.name;
                                let idIndex = ids.findIndex(id => {
                                    let variable = outScope?.getVariable(id);
                                    return (
                                        variable && name.indexOf(pathTo) !== -1
                                    );
                                });

                                response.body.variables.push(
                                    this.getVariableResponse(
                                        name,
                                        sv.value,
                                        ids[idIndex]
                                    )
                                );
                            });
                        }
                    } else {
                        response.body = {
                            variables: [
                                this.getVariableResponse(
                                    variable.name,
                                    variable.value,
                                    0,
                                    true
                                )
                            ]
                        };
                    }
                } else {
                    response.body = { variables: [] };
                }
            }

            this.sendResponse(response);
        }
    }

    private drillScope(scope: VariableScope, variable: any) {
        let id = scope.getIdFor(variable.name);
        if (id === -1) {
            id = this.scopeId++;
        }
        scope.setVariable(variable.name, variable.value, id);
        if (Array.isArray(variable.value)) {
            for (let i = 0; i < variable.value.length; i++) {
                let subVars = scope.getSubVariablesFor(id);
                let subId = 0;
                let name = `${variable.name}.${i}`;
                if (subVars) {
                    subId = subVars?.findIndex(sv => {
                        return name === sv.name;
                    });
                    if (subId === -1) {
                        subId = this.scopeId++;
                    }
                } else {
                    subId = this.scopeId++;
                }
                scope.setSubVariableFor(id, name, variable.value[i]);
                this.drillScope(scope, {
                    name: name,
                    value: variable.value[i]
                });
            }
        } else if (typeof variable.value === "object") {
            if (
                variable.value.__type__ &&
                variable.value.__type__ === "Object"
            ) {
                this.inspectCount++;
                this.runtime.inspectObject(variable.value.id, className => {
                    variable.value.__type__ = className;
                    variable.value.__render__ = () => className;
                    //TODO: Parse properties into object
                    this.inspectCount--;
                    if (this.inspectCount === 0 && this.inspectCallback) {
                        this.inspectCallback();
                    }
                });
            }
            for (const property in variable.value) {
                if (property !== "__type__" && property !== "__render__") {
                    let subVars = scope.getSubVariablesFor(id);
                    let subId = 0;
                    let name = `${variable.name}.${property}`;
                    if (subVars) {
                        subId = subVars?.findIndex(sv => {
                            return name === sv.name;
                        });
                        if (subId === -1) {
                            subId = this.scopeId++;
                        }
                    } else {
                        subId = this.scopeId++;
                    }
                    scope.setSubVariableFor(id, name, variable.value[property]);
                    this.drillScope(scope, {
                        name: name,
                        value: variable.value[property]
                    });
                }
            }
        }
    }

    private getVariableResponse(
        varName: string,
        varValue: any,
        id: number,
        skipSubVar?: boolean
    ) {
        let value = "";
        let refId = 0;
        let arrayCount = 0;
        let type = "";
        if (!skipSubVar) {
            if (typeof varValue === "number" && !Number.isInteger(varValue)) {
                value = String(
                    +Number.parseFloat(noExponents(varValue)).toFixed(4)
                );
                type = "Float";
            } else if (Array.isArray(varValue)) {
                value = "Array";
                refId = id;
                arrayCount = varValue.length;
                type = "array";
            } else if (typeof varValue === "object") {
                refId = id;
                if (varValue.__type__) {
                    if (varValue.__type__ === "Object") {
                        refId = 0;
                    }
                    if (varValue.__render__) {
                        value = varValue.__render__();
                    } else {
                        value = varValue.__type__;
                    }
                    type = varValue.__type__;
                } else {
                    value = "Object";
                }
            } else {
                if (varValue) {
                    if (Number.isInteger(varValue)) {
                        type = "Int";
                        value = `${varValue}`;
                    } else if (typeof varValue === "string") {
                        type = "String";
                        value = String(varValue);
                    } else {
                        type = "unknown";
                        value = `${varValue}`;
                    }
                } else {
                    if (Number.isInteger(varValue)) {
                        type = "Int";
                        value = "0";
                    } else {
                        type = "unknown";
                        value = "null";
                    }
                }
            }
        }
        return {
            name: varName.replace(/([a-zA-Z0-9_]+?\.)*/g, ""),
            value: value,
            variablesReference: refId,
            indexedVariables: arrayCount,
            type: type
        };
    }

    private getVariableScope(files: string[], scopeId: number) {
        let outScope: VariableScope | undefined;
        let isScope = false;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            let scopes = this.scopes.get(file);
            if (scopes) {
                let index = scopes.findIndex(s => {
                    return s.id === scopeId;
                });
                if (index !== -1) {
                    outScope = scopes[index];
                    isScope = true;
                    break;
                } else {
                    for (let l = 0; l < scopes.length; l++) {
                        const scope = scopes[l];
                        let ids = scope.getVariableIds();
                        for (let k = 0; k < ids.length; k++) {
                            const id = ids[k];
                            if (scopeId === id) {
                                outScope = scope;
                                isScope = false;
                                break;
                            }
                        }
                    }
                }
            }
        }

        return { isScope: isScope, scope: outScope };
    }

    private parseScope(varIds: number[], outScope: VariableScope) {
        let output: DebugProtocol.Variable[] = [];
        varIds.forEach(id => {
            let variable = outScope?.getVariable(id);
            if (variable && variable.name.indexOf(".") === -1) {
                output.push(
                    this.getVariableResponse(variable.name, variable.value, id)
                );
            }
        });

        return output;
    }
}

function noExponents(value: number): string {
    let data = String(value).split(/[eE]/);
    if (data.length === 1) {
        return data[0];
    }

    let z = "",
        sign = value < 0 ? "-" : "";
    let str = data[0].replace(".", "");
    let mag = Number(data[1]) + 1;

    if (mag < 0) {
        z = sign + "0.";
        while (mag++) {
            z += "0";
        }
        return z + str.replace(/^\-/, "");
    }
    mag -= str.length;
    while (mag--) {
        z += 0;
    }
    return str + z;
}
