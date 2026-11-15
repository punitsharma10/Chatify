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
import { PixifyExplore, PixifyReels, PixifySearch, PixifyPostPage, PixifyTag, PixifyArchive, PixifyActivity, PixifyPeopleList } from "../components/pixify/PixifyDiscover";
import { PixifyPlace, PixifyScheduled, PixifyHiddenWords } from "../components/pixify/PixifyExtras";
import PixifyNotifications from "../components/pixify/PixifyNotifications";
import { PixifyStoryArchive, PixifyCloseFriends } from "../components/pixify/Highlights";
import PixifyDirect, { DirectEmpty, DirectOpenUser } from "../components/pixify/direct/PixifyDirect";
import DirectThread from "../components/pixify/direct/DirectThread";
import ConnectifyLayout from "../components/connectify/ConnectifyLayout";
import { ConnectifyGroups, ConnectifyGroup, ConnectifyEvents, ConnectifyEvent, ConnectifyMarket, ConnectifyListing, ConnectifyWatch, ConnectifyMemories, ConnectifySaved, ConnectifyScheduled, ConnectifyTag, ConnectifyBirthdays, ConnectifyPokes } from "../components/connectify/ConnectifyMore";
import ConnectifyHome from "../components/connectify/ConnectifyHome";
import { ConnectifyPagesHub, ConnectifyPage } from "../components/connectify/CxPages";
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
                        { path : 'tags/:tag', element : <PixifyTag/> },
                        { path : 'places/:name', element : <PixifyPlace/> },
                        { path : 'scheduled', element : <PixifyScheduled/> },
                        { path : 'hidden-words', element : <PixifyHiddenWords/> },
                        { path : 'archive', element : <PixifyArchive/> },
                        { path : 'archive/stories', element : <PixifyStoryArchive/> },
                        { path : 'close-friends', element : <PixifyCloseFriends/> },
                        { path : 'activity', element : <PixifyActivity/> },
                        { path : 'people/:list', element : <PixifyPeopleList/> },
                        // Pixify Direct: Instagram-style messages (separate from Chats)
                        {
                            path : 'direct',
                            element : <PixifyDirect/>,
                            children : [
                                { index : true, element : <DirectEmpty/> },
                                { path : 'requests', element : <DirectEmpty/> },
                                { path : 't/:threadId', element : <DirectThread/> },
                                { path : 'u/:handle', element : <DirectOpenUser/> },
                            ]
                        },
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
                        { path : 'groups', element : <ConnectifyGroups/> },
                        { path : 'groups/:groupId', element : <ConnectifyGroup/> },
                        { path : 'pages', element : <ConnectifyPagesHub/> },
                        { path : 'pages/:pageId', element : <ConnectifyPage/> },
                        { path : 'events', element : <ConnectifyEvents/> },
                        { path : 'events/:eventId', element : <ConnectifyEvent/> },
                        { path : 'marketplace', element : <ConnectifyMarket/> },
                        { path : 'marketplace/:listingId', element : <ConnectifyListing/> },
                        { path : 'watch', element : <ConnectifyWatch/> },
                        { path : 'memories', element : <ConnectifyMemories/> },
                        { path : 'saved', element : <ConnectifySaved/> },
                        { path : 'scheduled', element : <ConnectifyScheduled/> },
                        { path : 'tags/:tag', element : <ConnectifyTag/> },
                        { path : 'birthdays', element : <ConnectifyBirthdays/> },
                        { path : 'pokes', element : <ConnectifyPokes/> },
                        // Connectify Messages: its own inbox (same screens as Pixify Direct, Connectify colours)
                        {
                            path : 'messages',
                            element : <div className='cx-as-px h-full'><PixifyDirect/></div>,
                            children : [
                                { index : true, element : <DirectEmpty/> },
                                { path : 'requests', element : <DirectEmpty/> },
                                { path : 't/:threadId', element : <DirectThread/> },
                                { path : 'u/:handle', element : <DirectOpenUser/> },
                            ]
                        },
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