import React,{useEffect,useState}from"react";
import{X,Settings,Check}from"lucide-react";

export default function SettingsPanel({onClose}){
 const[theme,setTheme]=useState(()=>localStorage.getItem("bhai_x_theme")||"dark");
 const[lang,setLang]=useState(()=>localStorage.getItem("bhai_x_lang")||"hi");
 const[doIt,setDoIt]=useState(()=>localStorage.getItem("bhai_x_default_doit")!=="false");
 function save(){
  localStorage.setItem("bhai_x_theme",theme);localStorage.setItem("bhai_x_lang",lang);localStorage.setItem("bhai_x_default_doit",String(doIt));
  document.documentElement.dataset.bhaiTheme=theme;onClose();
 }
 useEffect(()=>{document.documentElement.dataset.bhaiTheme=theme},[theme]);
 return <div className="panelOverlay"><div className="utilityPanel settingsPanel">
  <div className="utilityHead"><div><b>⚙️ BHAI X Settings</b><span>App preferences</span></div><button onClick={onClose}><X/></button></div>
  <div className="utilityBody">
   <label className="settingRow"><div><b>Theme</b><span>Appearance</span></div><select value={theme} onChange={e=>setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label>
   <label className="settingRow"><div><b>Language</b><span>Interface preference</span></div><select value={lang} onChange={e=>setLang(e.target.value)}><option value="hi">Hindi / Hinglish</option><option value="en">English</option></select></label>
   <label className="settingRow"><div><b>DO IT default</b><span>Start chats with execution enabled</span></div><button className={doIt?"settingToggle on":"settingToggle"} onClick={()=>setDoIt(v=>!v)}>{doIt?<><Check size={13}/> ON</>: "OFF"}</button></label>
   <button className="saveSettings" onClick={save}><Settings size={14}/> Save Settings</button>
  </div>
 </div></div>
}