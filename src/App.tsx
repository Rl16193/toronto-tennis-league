/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { Signup } from './pages/Signup';
import { Login } from './pages/Login';
import { Events } from './pages/Events';
import { Tournament } from './pages/Tournament';
import { Profile } from './pages/Profile';
import { League } from './pages/League';
import { Rules } from './pages/Rules';
import { CourtLocator } from './pages/CourtLocator';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="signup" element={<Signup />} />
            <Route path="login" element={<Login />} />
            <Route path="events" element={<Events />} />
            <Route path="tournament" element={<Tournament />} />
            <Route path="league" element={<League />} />
            <Route path="profile" element={<Profile />} />
            <Route path="locator" element={<CourtLocator />} />
            <Route path="rules" element={<Rules />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
