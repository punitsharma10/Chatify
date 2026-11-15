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
import PixifyLayout from "../components/pixify/PixifyLayout";
import PixifyHome from "../components/pixify/PixifyHome";
import PixifyProfile, { PixifyEditProfile } from "../components/pixify/PixifyProfile";
import { PixifyExplore, PixifyReels, PixifySearch, PixifyPostPage } from "../components/pixify/PixifyDiscover";
import PixifyNotifications from "../components/pixify/PixifyNotifications";
import ConnectifyLayout from "../components/connectify/ConnectifyLayout";
import ConnectifyHome from "../components/connectify/ConnectifyHome";
import { ConnectifyProfile, ConnectifyFriends, ConnectifyNotifications, ConnectifySearch, ConnectifyPostPage, ConnectifyMenu } from "../components/connectify/ConnectifyPages";

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
                    element : <PixifyLayout/>,
                    children : [
                        { index : true, element : <PixifyHome/> },
                        { path : 'explore', element : <PixifyExplore/> },
                        { path : 'reels', element : <PixifyReels/> },
                        { path : 'search', element : <PixifySearch/> },
                        { path : 'notifications', element : <PixifyNotifications/> },
                        { path : 'edit', element : <PixifyEditProfile/> },
                        { path : 'p/:postId', element : <PixifyPostPage/> },
                        { path : 'u/:handle', element : <PixifyProfile/> },
                    ]
                },
                {
                    path : 'connectify',
                    element : <ConnectifyLayout/>,
                    children : [
                        { index : true, element : <ConnectifyHome/> },
                        { path : 'friends', element : <ConnectifyFriends/> },
                        { path : 'notifications', element : <ConnectifyNotifications/> },
                        { path : 'search', element : <ConnectifySearch/> },
                        { path : 'menu', element : <ConnectifyMenu/> },
                        { path : 'p/:postId', element : <ConnectifyPostPage/> },
                        { path : 'u/:handle', element : <ConnectifyProfile/> },
                    ]
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