import { RecoilRoot } from 'recoil';
import { ToastContainer } from "react-toastify";
import {
  Authenticator,
  ThemeProvider,
  View,
  useAuthenticator,
  useTheme,
} from '@aws-amplify/ui-react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Library from './pages/Library';
import Upload from './pages/Upload';
import Navbar from './components/Navbar';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';
import '@aws-amplify/ui-react/styles.css';
import { customTheme } from './theme/auth.theme';
import { useEffect } from 'react';

Amplify.configure(awsExports);

const AuthHeader = () => {
  const { tokens } = useTheme();
  const { route } = useAuthenticator(); // Current Authenticator route

  // Only show the Vault logo when the user is not logged in
  const authRoutes = [
    "signIn",
    "signUp",
    "resetPassword",
    "confirmResetPassword",
    "confirmSignIn",
    "confirmSignUp",
    "forgotPassword",
    "setupTotp",
    "verifyUser",
  ];

  const isLoggedIn = !authRoutes.includes(route);

  if (isLoggedIn) {
    return null; // Hide header if user is logged in
  }

  return (
    <View
      textAlign="center"
      padding={tokens.space.large}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '20px auto',
        gap: '8px',
        color: 'var(--text-color)',
        fontSize: '24px',
      }}
    >
      <span className="lock-icon" style={{ fontSize: '30px', color: 'yellow' }}>🔒</span>
      <h1 style={{ fontSize: '24px' }}>Vault</h1>
    </View>
  );
};

function App() {
  useEffect(() => {
    if ((window.navigator as Navigator & { standalone?: boolean }).standalone || window.matchMedia('(display-mode: standalone)').matches) {
      alert("Please open this app in a standard browser for full functionality.");
    }
    
    }, []);

  return (
    <RecoilRoot>
      <ToastContainer></ToastContainer>
      <ThemeProvider theme={customTheme}>
        <Authenticator
          components={{
            Header: AuthHeader, // Add custom header
          }}
        >
          {({ signOut }) => (
            <BrowserRouter>
              <Navbar signOut={signOut!} />
              <Routes>
                <Route path="/" element={<Library />} />
                <Route path="/upload" element={<Upload />} />
              </Routes>
            </BrowserRouter>
          )}
        </Authenticator>
      </ThemeProvider>
    </RecoilRoot>
  );
}

export default App;
