//! App-owned Grok Build media-tool policy in `GROK_HOME/config.toml`.
use crate::paths::{config_toml_path, ensure_dirs, grok_home};
use serde::Serialize;
use std::fs;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaToolsConfigSnapshot { pub grok_home: String, pub image_gen_enabled: Option<bool>, pub video_gen_enabled: Option<bool>, pub note: String }
fn bool_at(raw: &str, key: &str) -> Option<bool> { let needle_true=format!("{key} = true"); let needle_false=format!("{key} = false"); if raw.contains(&needle_true) { Some(true) } else if raw.contains(&needle_false) { Some(false) } else { None } }
fn upsert(raw: &str, key: &str, value: bool) -> String { let line=format!("{key} = {value}"); if let Some(start)=raw.lines().scan(0usize,|o,l|{let at=*o;*o+=l.len()+1;Some((at,l))}).find_map(|(at,l)|(l.trim()=="[features]").then_some(at)) { let tail=&raw[start..]; let end=tail.find("\n[").map(|n|start+n+1).unwrap_or(raw.len()); let body=&raw[start..end]; let mut seen=false; let body=body.lines().map(|l| if l.split_once('=').is_some_and(|(a,_)|a.trim()==key) {seen=true;line.clone()} else {l.to_string()}).collect::<Vec<_>>().join("\n"); format!("{}{}{}",&raw[..start],if seen {body} else {format!("{body}\n{line}")},&raw[end..]) } else { format!("{}[features]\n{line}\n",if raw.trim().is_empty(){String::new()}else{format!("{}\n\n",raw.trim_end())}) } }
fn read() -> Result<MediaToolsConfigSnapshot,String> { let _=ensure_dirs(); let raw=fs::read_to_string(config_toml_path()).unwrap_or_default(); Ok(MediaToolsConfigSnapshot{grok_home:grok_home().display().to_string(),image_gen_enabled:bool_at(&raw,"image_gen_enabled"),video_gen_enabled:bool_at(&raw,"video_gen_enabled"),note:"Applies to newly started Grok Build sessions; the engine remains the final capability gate.".into()}) }
#[tauri::command] pub fn media_tools_config_get() -> Result<MediaToolsConfigSnapshot,String>{read()}
#[tauri::command] pub fn media_tools_config_set(kind:String,enabled:bool)->Result<MediaToolsConfigSnapshot,String>{let key=match kind.as_str(){"image"=>"image_gen_enabled","video"=>"video_gen_enabled",_=>return Err("kind must be image or video".into())};let p=config_toml_path();let raw=fs::read_to_string(&p).unwrap_or_default();fs::write(&p,upsert(&raw,key,enabled)).map_err(|e|e.to_string())?;read()}

#[cfg(test)]
mod tests { use super::{bool_at,upsert}; #[test] fn only_features_changes() { let raw="[models]\ndefault = \"grok\"\n\n[features]\nvideo_gen_enabled = true\n\n[subagents]\nenabled = false\n"; let next=upsert(raw,"image_gen_enabled",false); assert!(next.contains("image_gen_enabled = false"), "{next}"); assert_eq!(bool_at(&next,"image_gen_enabled"),Some(false)); assert!(next.contains("video_gen_enabled = true")); assert!(next.contains("[models]\ndefault = \"grok\"")); assert!(next.contains("[subagents]\nenabled = false")); } }
