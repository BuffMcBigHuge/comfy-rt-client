import React, { useState, useEffect } from 'react';
import { auth, RecaptchaVerifier, signInWithPhoneNumber } from '../firebase'; // Adjust the path as necessary
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Button from './components/Button';

const PhoneLogin = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const setUpRecaptcha = () => {
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
    }
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        console.log('recaptcha resolved..');
      }
    });
  };

  const onSignInSubmit = (e) => {
    e.preventDefault();
    setUpRecaptcha();
    const phoneNumberWithCountryCode = '+1' + phoneNumber; // Adjust the country code as necessary
    const appVerifier = window.recaptchaVerifier;
    signInWithPhoneNumber(auth, phoneNumberWithCountryCode, appVerifier)
      .then((confirmationResult) => {
        window.confirmationResult = confirmationResult;
        setVerificationId(confirmationResult.verificationId);
      }).catch((error) => {
        console.error('Error during signInWithPhoneNumber', error);
      });
  };

  const onSubmitCode = (e) => {
    e.preventDefault();
    const codeEntered = code;
    window.confirmationResult.confirm(codeEntered)
      .then((result) => {
        const user = result.user;
        console.log('User is signed in', user);
        setUser(user);
      }).catch((error) => {
        console.error('Error during confirmation', error);
      });
  };

  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        setUser(null);
        console.log('User signed out');
      })
      .catch((error) => {
        console.error('Error during sign out', error);
      });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        {user ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">Welcome, {user.phoneNumber}</h2>
            <p><strong>UID:</strong> {user.uid}</p>
            <p><strong>Email:</strong> {user.email || 'No email provided'}</p>
            <p><strong>Phone Number:</strong> {user.phoneNumber}</p>
            <Button
              variant="danger"
              onClick={handleLogout}
              className="mt-4 w-full flex justify-center py-2 px-4"
            >
              Logout
            </Button>
          </div>
        ) : (
          !verificationId ? (
            <form onSubmit={onSignInSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone number</label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Phone number"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <Button
                  variant="primary"
                  type="submit"
                  id="sign-in-button"
                  className="w-full flex justify-center py-2 px-4 "
                >
                  Send Verification Code
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={onSubmitCode} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Verification code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Verification code"
                  className="mt-1 block w-full px-3 py-2"
                />
              </div>
              <div>
                <Button
                  variant="primary"
                  type="submit"
                  className="w-full flex justify-center py-2 px-4 "
                >
                  Verify Code
                </Button>
              </div>
            </form>
          )
        )}
        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
};

export default PhoneLogin;