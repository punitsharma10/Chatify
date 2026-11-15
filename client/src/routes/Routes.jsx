import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import Register from "../pages/Register";
import CheckEmail from "../pages/CheckEmail";
import CheckPassword from "../pages/CheckPassword";
import Home from "../pages/Home";
import Message from "../components/Message";
import AuthLayout from "../layout/AuthLayout";
import ForgotPassword from "../pages/ForgetPassword";
import JoinGroup from "../components/JoinGroup";
import Pixify from "../pages/Pixify";
import Connectify from "../pages/Connectify";

const router = createBrowserRouter([
{
    path : "/",
    element : <App/>,
    children : [
        {
            path : "register",
            element : <AuthLayout><Register/></AuthLayout>
        },
        {
            path : 'email',
            element : <AuthLayout><CheckEmail/></AuthLayout>
        },
        {
            path : 'password',
            element : <AuthLayout><CheckPassword/></AuthLayout>
        },
        {
            path : 'forgotpassword',
            element : <AuthLayout><ForgotPassword/></AuthLayout>
        },
        {
            path : "/",
            element : <Home/>,
            children : [
                // the other two apps share the same login and connection (see pages/Home.jsx)
                {
                    path : 'pixify',
                    element : <Pixify/>
                },
                {
                    path : 'connectify',
                    element : <Connectify/>
                },
                {
                    path : ':userId',
                    element : <Message/>
                },
                {
                    // group invite link
                    path : 'join/:code',
                    element : <JoinGroup/>
                }
            ]
        }
    ]
}
])

export default router