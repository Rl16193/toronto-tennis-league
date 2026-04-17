import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { User, Mail, Phone, Edit2, Save, X } from 'lucide-react';

interface ProfileInfoProps {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  editData: any;
  setEditData: (data: any) => void;
  onSave: () => void;
  updateLoading: boolean;
  hasGoogleProvider: boolean;
  onLinkGoogle: () => void;
  linkingGoogle: boolean;
  showEmailForm: boolean;
  setShowEmailForm: (show: boolean) => void;
  emailChangeData: any;
  setEmailChangeData: (data: any) => void;
  emailChangeLoading: boolean;
  emailVerificationPending: boolean;
  onStartEmailChange: () => void;
  onRefreshEmailChange: () => void;
  onCancelEmailChange: () => void;
}

export const ProfileInfo: React.FC<ProfileInfoProps> = ({
  isEditing,
  setIsEditing,
  editData,
  setEditData,
  onSave,
  updateLoading,
  hasGoogleProvider,
  onLinkGoogle,
  linkingGoogle,
  showEmailForm,
  setShowEmailForm,
  emailChangeData,
  setEmailChangeData,
  emailChangeLoading,
  emailVerificationPending,
  onStartEmailChange,
  onRefreshEmailChange,
  onCancelEmailChange,
}) => {
  const { profile } = useAuth();

  const formatPhoneInput = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)})-${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)})-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };

  if (!profile) return null;

  return (
    <div className="lg:col-span-2">
      <div className={`relative overflow-hidden rounded-[2.5rem] border transition-all duration-500 ${
        isEditing ? 'bg-gray-800/50 border-white/10' : 'bg-tennis-surface/30 border-white/5 shadow-xl'
      }`}>
        <div className="p-8 md:p-10">
          <div className="flex justify-between items-start mb-8">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <User className="w-6 h-6 mr-3 text-clay" />
              Info
            </h2>
            {!isEditing ? (
              <Button variant="ghost" size="sm" onClick={() => {
                setEditData({
                  ...editData,
                  user: {
                    ...editData.user,
                    name: profile.user.name,
                    phone: profile.user.phone,
                  },
                });
                setIsEditing(true);
              }}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </Button>
            ) : (
              <div className="flex space-x-2">
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button size="sm" onClick={onSave} isLoading={updateLoading}>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row items-center md:items-start gap-10">
            <div className="relative group">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem] border-4 border-tennis-dark bg-tennis-surface overflow-hidden shadow-2xl">
                <img 
                  src={profile.user.avatar || `https://ui-avatars.com/api/?name=${profile.user.name}&background=FF6B35&color=fff`} 
                  alt={profile.user.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              {isEditing ? (
                <>
                  <Input 
                    label="Full Name" 
                    value={editData.user?.name ?? profile.user.name} 
                    onChange={(e) => setEditData({
                      ...editData,
                      user: {
                        ...editData.user,
                        name: e.target.value,
                        phone: editData.user?.phone ?? profile.user.phone,
                      },
                    })}
                  />
                  <Input 
                    label="Phone Number" 
                    value={editData.user?.phone ?? profile.user.phone} 
                    onChange={(e) => setEditData({
                      ...editData,
                      user: {
                        ...editData.user,
                        name: editData.user?.name ?? profile.user.name,
                        phone: formatPhoneInput(e.target.value),
                      },
                    })}
                  />
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-400">Email Address</label>
                    <div className="flex items-center space-x-3 p-3 bg-white/5 border border-white/5 rounded-2xl text-gray-500">
                      <Mail className="w-4 h-4" />
                      <span>{profile.user.email}</span>
                    </div>
                    {!showEmailForm ? (
                      <Button variant="clay" size="sm" className="w-full mt-2" onClick={() => setShowEmailForm(true)}>
                        Change email
                      </Button>
                    ) : (
                      <div className="space-y-3 mt-3">
                        <Input
                          label="New Email"
                          type="email"
                          value={emailChangeData.newEmail}
                          onChange={(e) => setEmailChangeData({ ...emailChangeData, newEmail: e.target.value })}
                        />
                        <Input
                          label="Password"
                          type="password"
                          value={emailChangeData.password}
                          onChange={(e) => setEmailChangeData({ ...emailChangeData, password: e.target.value })}
                        />
                        <div className="flex flex-col gap-2">
                          <Button variant="clay" size="sm" className="w-full" onClick={onStartEmailChange} isLoading={emailChangeLoading}>
                            Reauthenticate and Send Verification
                          </Button>
                          {emailVerificationPending && (
                            <Button variant="outline" size="sm" className="w-full" onClick={onRefreshEmailChange} isLoading={emailChangeLoading}>
                              I&apos;ve Verified My New Email
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="w-full" onClick={onCancelEmailChange}>
                            Cancel email change
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Name</p>
                    <p className="text-xl font-bold text-clay">{profile.user.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Email</p>
                    <p className="text-xl font-bold text-clay">{profile.user.email}</p>
                  </div>
                  {!hasGoogleProvider ? (
                    <div className="rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-gray-300">
                      <p className="font-bold text-gray-100">Want Google sign-in later?</p>
                      <p className="mt-1 text-gray-400">Link your Google account now so you can use it for future sign-ins.</p>
                      <Button
                        variant="clay"
                        size="sm"
                        className="mt-4"
                        onClick={onLinkGoogle}
                        isLoading={linkingGoogle}
                      >
                        Connect Google
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                      <p className="font-bold">Google is connected to your account.</p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Phone</p>
                    <p className="text-xl font-bold text-clay">{profile.user.phone}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/10 pt-6 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={onSave} isLoading={updateLoading}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
