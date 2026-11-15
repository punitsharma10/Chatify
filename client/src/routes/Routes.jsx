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