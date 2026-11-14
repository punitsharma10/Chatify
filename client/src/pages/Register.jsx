import React, { useState } from "react";
import { IoClose, IoCamera } from "react-icons/io5";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import axios from "axios";
import uploadFile from "../helpers/uploadFile";
import { notify, notifyError } from '../helpers/toast';
import { setToken } from "../redux/userSlice";
import AuthAside from "../components/AuthAside";
import DefaultAvatar from "../components/DefaultAvatar";
import EmailOtpStep from "../components/EmailOtpStep";
import PasswordFields, { passwordProblem } from "../components/PasswordFields";
import { formatPhone } from "../helpers/phone";

const API = process.env.REACT_APP_BACKEND_URL;

// Registration: 1) email  2) 6-digit code sent to that email  3) profile + password
const Register = () => {
  const [verified, setVerified] = useState(null); // { channel, target, token }
  const [data, setData] = useState({ name: "", profile_pic: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleUploadPhoto = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      setPhotoName(file.name);
      setData((d) => ({ ...d, profile_pic: uploaded?.url || "" }));
    } catch {
      notifyError("Couldn't upload the photo. Please try again.");
    }
    setUploading(false);
  };

  const clearPhoto = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPhotoName("");
    setData((d) => ({ ...d, profile_pic: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTried(true);
    setError("");
    const problem = passwordProblem(password, confirm) || (password !== confirm ? "Passwords don't match." : "");
    if (!data.name.trim()) return setError("Please enter your name.");
    if (problem) return setError(problem);

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/api/register`, {
        name: data.name,
        [verified.channel === "sms" ? "phone" : "email"]: verified.target,
        profile_pic: data.profile_pic,
        password,
        confirmPassword: confirm,
        verifyToken: verified.token,
      });

      // sign in straight away, like WhatsApp after verification
      try {
        const login = await axios.post(`${API}/api/password`, { userId: res.data.data._id, password }, { withCredentials: true });
        if (login.data.success) {
          dispatch(setToken(login.data.token));
          localStorage.setItem("token", login.data.token);
          notify(`Welcome to Chatify, ${data.name.trim().split(" ")[0]}!`);
          navigate("/");
          return;
        }
      } catch { /* fall back to the login page */ }
      notify("Account created. Log in to continue.");
      navigate("/email");
    } catch (err) {
      const body = err?.response?.data;
      if (body?.code === "not_verified") {
        notifyError("Your verification expired. Please verify again.");
        setVerified(null);
      } else {
        setError(body?.message || "Couldn't create your account. Please try again.");
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="grid md:grid-cols-[1.15fr,1fr]">
      <div className="p-6 sm:p-10 lg:p-12">
        {!verified ? (
          <EmailOtpStep
            purpose="register"
            title="Create your account"
            subtitle="Use your email or phone number. We'll send a 6-digit code to verify it's really you."
            onVerified={(id, token) => setVerified({ ...id, token })}
            footer={
              <p className="text-sm text-wa-muted">
                Already have an account?{" "}
                <Link to={"/email"} className="font-medium text-wa-green hover:underline">Log in</Link>
              </p>
            }
          />
        ) : (
          <>
            <p className="inline-flex items-center gap-2 rounded-full bg-wa-green/10 px-3 py-1 text-xs font-medium text-wa-teal">
              ✓ {verified.channel === "sms" ? formatPhone(verified.target) : verified.target} verified
            </p>
            <h1 className="mt-5 text-2xl font-light text-wa-text sm:text-[28px]">Profile info</h1>
            <p className="mt-1 text-sm text-wa-muted">Add your name, an optional photo and a password.</p>

            <form className="mt-8 grid gap-6" onSubmit={handleSubmit} noValidate>
              <div className="flex items-center gap-5">
                <label htmlFor="profile_pic" className="group relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full">
                  {data.profile_pic ? (
                    <img src={data.profile_pic} alt="profile" className="h-full w-full object-cover" />
                  ) : (
                    <DefaultAvatar />
                  )}
                  <div className={`absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-[10px] font-medium uppercase leading-tight text-white transition-opacity ${data.profile_pic && !uploading ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
                    {uploading ? (
                      <span className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        <IoCamera size={22} />
                        <span className="mt-1 text-center">{data.profile_pic ? "Change" : "Add photo"}</span>
                      </>
                    )}
                  </div>
                </label>
                <div className="min-w-0">
                  <p className="text-[15px] text-wa-text">Profile photo <span className="text-wa-muted">(optional)</span></p>
                  {photoName ? (
                    <div className="mt-1 flex items-center gap-2 text-sm text-wa-muted">
                      <span className="max-w-[200px] truncate">{photoName}</span>
                      <button type="button" onClick={clearPhoto} className="rounded-full p-1 hover:bg-wa-panel hover:text-red-500" title="Remove photo">
                        <IoClose />
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-wa-muted">Click the circle to upload</p>
                  )}
                </div>
                <input type="file" id="profile_pic" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
              </div>

              <div>
                <label htmlFor="name" className="text-sm text-wa-green">Your name</label>
                <input
                  type="text"
                  id="name"
                  maxLength={50}
                  placeholder="Enter your name"
                  className="wa-input"
                  value={data.name}
                  onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
                  required
                />
              </div>

              <PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} showErrors={tried} />

              {error && <p role="alert" className="-mt-2 text-sm text-red-600">{error}</p>}

              <div className="mt-2 flex flex-col-reverse items-stretch gap-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                <button type="button" onClick={() => setVerified(null)} className="text-sm font-medium text-wa-green hover:underline">Use a different email or number</button>
                <button className="wa-btn" disabled={uploading || submitting}>{submitting ? "Creating account…" : "Create account"}</button>
              </div>
            </form>
          </>
        )}
      </div>

      <AuthAside />
    </div>
  );
};

export default Register;
