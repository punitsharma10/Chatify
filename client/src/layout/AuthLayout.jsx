import React from "react";
import { IoChatbubbleEllipses } from "react-icons/io5";
import MadeBy from "../components/MadeBy";

const AuthLayout = ({ children }) => {
  return (
    <div className="relative min-h-dvh bg-wa-surface sm:bg-wa-panel">
      {/* green top band */}
      <div className="absolute inset-x-0 top-0 h-[76px] bg-wa-green sm:h-56" />

      <div className="relative mx-auto max-w-[1000px] pt-4 sm:px-6 sm:pb-10 sm:pt-7">
        <header className="flex items-center gap-3 px-4 text-white sm:px-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-surface/20">
            <IoChatbubbleEllipses size={22} />
          </div>
          <span className="text-sm font-semibold uppercase tracking-wider">Chatify Web</span>
        </header>

        <div className="mt-4 overflow-hidden bg-wa-surface sm:mt-9 sm:rounded-md sm:shadow-card">
          {children}
        </div>

        <MadeBy className="mt-6 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mt-8" />
      </div>
    </div>
  );
};

export default AuthLayout;
