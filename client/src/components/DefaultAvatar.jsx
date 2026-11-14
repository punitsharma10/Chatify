import React from "react";

// Grey silhouette used when a user has no profile photo
const DefaultAvatar = ({ className = "" }) => (
  <svg viewBox="0 0 212 212" className={`h-full w-full ${className}`} aria-hidden="true">
    <circle cx="106" cy="106" r="106" fill="#dfe5e7" />
    <path
      fill="#ffffff"
      d="M106 45c-20.4 0-37 16.6-37 37s16.6 37 37 37 37-16.6 37-37-16.6-37-37-37zm0 87c-34 0-62 16-75 41.5C50.3 197 76.7 212 106 212s55.7-15 75-38.5C168 148 140 132 106 132z"
    />
  </svg>
);

export default DefaultAvatar;
