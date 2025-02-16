import React from "react";
import chatApplogo from "../assets/chat.png";

const AuthLayout = ({ children }) => {
  return (
    <>
      <header className="flex justify-center items-center py-3 h-20 shadow-md bg-white">
        <img src={chatApplogo} alt="logo" width={245} height={150} />
      </header>

      {children}
    </>
  );
};

export default AuthLayout;
