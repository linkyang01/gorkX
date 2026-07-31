//! A small, app-owned MCP stdio server for the explicit local Computer tools.
//!
//! This process is launched by Grok Build only after the user registers the
//! `gorkx-computer` MCP entry. Every action still checks the short-lived
//! gorkX control lease, so removing the lease from the desktop emergency-stop
//! button immediately makes this process refuse screenshots and actions.

use crate::computer;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

const SERVER_NAME: &str = "gorkx-computer";
const SERVER_VERSION: &str = "1.0.0";
const PROTOCOL_VERSION: &str = "2024-11-05";

pub fn run() -> Result<(), String> {
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout());
    for line in stdin.lock().lines() {
        let line = line.map_err(|error| format!("read Computer MCP request: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let request: Value = serde_json::from_str(&line)
            .map_err(|error| format!("invalid Computer MCP JSON: {error}"))?;
        let Some(method) = request.get("method").and_then(Value::as_str) else {
            continue;
        };
        // Notifications intentionally receive no response.
        if request.get("id").is_none() {
            continue;
        }
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        let response = match method {
            "initialize" => success(
                id,
                json!({
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION },
                    "instructions": "All tools operate only in the visible foreground app after the user enables gorkX Computer controls. Ask for confirmation before consequential actions."
                }),
            ),
            "ping" => success(id, json!({})),
            "tools/list" => success(id, json!({ "tools": tool_definitions() })),
            "tools/call" => handle_tool_call(id, request.get("params")),
            _ => error(id, -32601, format!("Unsupported MCP method: {method}")),
        };
        serde_json::to_writer(&mut stdout, &response)
            .map_err(|error| format!("write Computer MCP response: {error}"))?;
        stdout
            .write_all(b"\n")
            .map_err(|error| format!("write Computer MCP response: {error}"))?;
        stdout
            .flush()
            .map_err(|error| format!("flush Computer MCP response: {error}"))?;
    }
    Ok(())
}

fn success(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message.into() } })
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "gorkx_computer_status",
            "description": "Check whether macOS Accessibility permission and the user-enabled gorkX foreground Computer lease are available.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "gorkx_computer_screenshot",
            "description": "Capture the current visible screen once. Use only after the user explicitly enabled gorkX Computer controls; never poll in the background.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "gorkx_computer_click",
            "description": "Click a coordinate in the current visible foreground screen. Confirm the target and consequence with the user before clicking.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "x": { "type": "integer", "minimum": 0, "maximum": 20000 },
                    "y": { "type": "integer", "minimum": 0, "maximum": 20000 }
                },
                "required": ["x", "y"],
                "additionalProperties": false
            }
        },
        {
            "name": "gorkx_computer_key",
            "description": "Press one fixed key in the current foreground app. Use only for a user-approved visible action.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "key": { "type": "string", "enum": ["enter", "escape", "tab", "space", "backspace", "delete", "left", "right", "up", "down", "home", "end"] }
                },
                "required": ["key"],
                "additionalProperties": false
            }
        },
        {
            "name": "gorkx_computer_type",
            "description": "Type bounded text into the current foreground app. Confirm the destination and sensitive content before using it.",
            "inputSchema": {
                "type": "object",
                "properties": { "text": { "type": "string", "minLength": 1, "maxLength": 2000 } },
                "required": ["text"],
                "additionalProperties": false
            }
        },
        {
            "name": "gorkx_computer_stop",
            "description": "Disable the gorkX Computer control lease. Use this as a tool-level emergency stop.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        }
    ])
}

fn handle_tool_call(id: Value, params: Option<&Value>) -> Value {
    let Some(params) = params.and_then(Value::as_object) else {
        return error(id, -32602, "tools/call params must be an object");
    };
    let Some(name) = params.get("name").and_then(Value::as_str) else {
        return error(id, -32602, "tools/call requires a tool name");
    };
    let arguments = params
        .get("arguments")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let result = match name {
        "gorkx_computer_status" => status_result(),
        "gorkx_computer_screenshot" => screenshot_result(),
        "gorkx_computer_click" => click_result(&arguments),
        "gorkx_computer_key" => key_result(&arguments),
        "gorkx_computer_type" => type_result(&arguments),
        "gorkx_computer_stop" => stop_result(),
        _ => return error(id, -32602, format!("Unknown Computer tool: {name}")),
    };
    success(id, result)
}

fn status_result() -> Value {
    let granted = computer::check_accessibility();
    let enabled = granted && computer::control_lease_active();
    tool_result_text(json!({ "granted": granted, "enabled": enabled }))
}

fn screenshot_result() -> Value {
    match computer::screenshot_as_base64() {
        Ok((mime_type, data)) => json!({
            "content": [{ "type": "image", "data": data, "mimeType": mime_type }]
        }),
        Err(message) => tool_error(message),
    }
}

fn click_result(arguments: &serde_json::Map<String, Value>) -> Value {
    let Some(x) = arguments.get("x").and_then(Value::as_i64) else {
        return tool_error("gorkx_computer_click requires integer x and y".into());
    };
    let Some(y) = arguments.get("y").and_then(Value::as_i64) else {
        return tool_error("gorkx_computer_click requires integer x and y".into());
    };
    let (Ok(x), Ok(y)) = (i32::try_from(x), i32::try_from(y)) else {
        return tool_error("click coordinates are out of range".into());
    };
    if let Err(message) = computer::validate_coordinates(x, y) {
        return tool_error(message);
    }
    let script = format!(
        "tell application \"System Events\"\n    click at {{{x}, {y}}}\n    tell first application process whose frontmost is true to return name\nend tell"
    );
    action_result(computer::execute_osascript("click", &script))
}

fn key_result(arguments: &serde_json::Map<String, Value>) -> Value {
    let Some(key) = arguments.get("key").and_then(Value::as_str) else {
        return tool_error("gorkx_computer_key requires a fixed key".into());
    };
    let key = key.trim().to_ascii_lowercase();
    let Some(code) = computer::key_code(&key) else {
        return tool_error(format!("Unsupported key: {key}"));
    };
    let script = format!(
        "tell application \"System Events\"\n    key code {code}\n    tell first application process whose frontmost is true to return name\nend tell"
    );
    action_result(computer::execute_osascript("press-key", &script))
}

fn type_result(arguments: &serde_json::Map<String, Value>) -> Value {
    let Some(text) = arguments.get("text").and_then(Value::as_str) else {
        return tool_error("gorkx_computer_type requires text".into());
    };
    if let Err(message) = computer::validate_text(text) {
        return tool_error(message);
    }
    let value = computer::apple_script_string(text);
    let script = format!(
        "tell application \"System Events\"\n    keystroke {value}\n    tell first application process whose frontmost is true to return name\nend tell"
    );
    action_result(computer::execute_osascript("type-text", &script))
}

fn stop_result() -> Value {
    match computer::emergency_stop_lease() {
        Ok(()) => tool_result_text(json!({ "enabled": false, "stopped": true })),
        Err(message) => tool_error(message),
    }
}

fn action_result(result: Result<computer::ComputerActionResult, String>) -> Value {
    match result {
        Ok(value) => tool_result_text(serde_json::to_value(value).unwrap_or_else(|_| json!({}))),
        Err(message) => tool_error(message),
    }
}

fn tool_result_text(value: Value) -> Value {
    json!({
        "content": [{ "type": "text", "text": serde_json::to_string(&value).unwrap_or_else(|_| "{}".into()) }]
    })
}

fn tool_error(message: String) -> Value {
    json!({ "isError": true, "content": [{ "type": "text", "text": message }] })
}

#[cfg(test)]
mod tests {
    use super::tool_definitions;

    #[test]
    fn tool_catalog_is_fixed_and_has_no_shell_tool() {
        let catalog = tool_definitions();
        let tools = catalog.as_array().unwrap();
        assert_eq!(tools.len(), 6);
        assert!(tools.iter().any(|tool| tool["name"] == "gorkx_computer_screenshot"));
        assert!(!tools.iter().any(|tool| tool["name"].as_str().unwrap_or_default().contains("shell")));
    }
}
