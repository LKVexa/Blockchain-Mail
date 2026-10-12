import React,{useState,useEffect} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {GlyphokuStudio} from '@/components/glyphoku/studio';
import {preferredTheme} from '@/lib/glyphoku/client';
try{document.documentElement.dataset.theme=preferredTheme(window.localStorage,window.matchMedia('(prefers-color-scheme: dark)').matches);}catch{document.documentElement.dataset.theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
function Bootstrap(){const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return ready?<GlyphokuStudio/>:<div/>;}
const root=document.getElementById('root');if(!root)throw Error('Root element missing');hydrateRoot(root,<Bootstrap/>);
