import React from "react";
import { IoChatbubblesOutline, IoImagesOutline, IoFlashOutline } from "react-icons/io5";

const points = [
  { icon: <IoChatbubblesOutline size={20} />, text: "Chat one-on-one with anyone on Chatify" },
  { icon: <IoImagesOutline size={20} />, text: "Share photos and videos instantly" },
  { icon: <IoFlashOutline size={20} />, text: "See who's online and when messages are read" },
];

const AuthAside = () => (
  <aside className="hidden md:flex flex-col justify-center gap-6 border-l border-wa-border bg-wa-panel/70 p-12">
    <h2 className="text-xl font-light text-wa-text">Why Chatify?</h2>
    <ul className="space-y-5">
      {points.map((p, i) => (
        <li key={i} className="flex items-start gap-4 text-[15px] text-wa-muted">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wa-green/10 text-wa-green">
            {p.icon}
          </span>
          <span className="pt-1.5">{p.text}</span>
        </li>
      ))}
    </ul>
  </aside>
);

export default AuthAside;
