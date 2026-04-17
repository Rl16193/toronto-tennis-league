import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/Button';
import { Trophy, Edit2, Save, X } from 'lucide-react';
import { SKILL_DESCRIPTIONS, SKILL_LEVELS } from '../../../utils/skillLevels';

interface ProfileSkillsProps {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  editData: any;
  setEditData: (data: any) => void;
  onSave: () => void;
  updateLoading: boolean;
}

export const ProfileSkills: React.FC<ProfileSkillsProps> = ({
  isEditing,
  setIsEditing,
  editData,
  setEditData,
  onSave,
  updateLoading,
}) => {
  const { profile } = useAuth();

  if (!profile) return null;

  const selectedSkillIndex = Math.max(
    0,
    SKILL_LEVELS.indexOf((editData.stats?.skill_level ?? profile?.stats.skill_level ?? 2) as typeof SKILL_LEVELS[number])
  );

  return (
    <div className={`rounded-[2.5rem] border transition-all duration-500 ${
      isEditing ? 'bg-gray-800/50 border-white/10' : 'bg-tennis-surface/30 border-white/5 shadow-xl'
    }`}>
      <div className="p-8">
        <div className="flex justify-between items-start mb-8">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <Trophy className="w-6 h-6 mr-3 text-clay" />
            Skills
          </h2>
          {!isEditing ? (
            <Button variant="ghost" size="sm" onClick={() => {
              setEditData({
                ...editData,
                stats: {
                  ...editData.stats,
                  skill_level: profile.stats.skill_level,
                  tournament_preference: profile.stats.tournament_preference,
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
                <X className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={onSave} isLoading={updateLoading}>
                <Save className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider">
                NTRP Level: {editData.stats?.skill_level ?? profile.stats.skill_level}
              </label>
              <input 
                type="range"
                min="0"
                max={SKILL_LEVELS.length - 1}
                step="1"
                value={selectedSkillIndex}
                onChange={(e) => setEditData({
                  ...editData,
                  stats: {
                    ...editData.stats,
                    skill_level: SKILL_LEVELS[Number(e.target.value)],
                    tournament_preference: editData.stats?.tournament_preference ?? profile.stats.tournament_preference,
                  },
                })}
                className="w-full h-2 bg-tennis-dark rounded-full appearance-none cursor-pointer accent-clay"
              />
              <div className="flex items-start justify-between gap-2 text-center">
                {SKILL_LEVELS.map((level) => (
                  <span
                    key={level}
                    className={`text-[10px] font-black tracking-widest ${(editData.stats?.skill_level ?? profile.stats.skill_level) === level ? 'text-clay' : 'text-gray-500'}`}
                  >
                    {level.toFixed(1)}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-400 italic">
                "{SKILL_DESCRIPTIONS[(editData.stats?.skill_level ?? profile.stats.skill_level) as number]}"
              </p>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider">Tournament Choice</label>
              <div className="grid grid-cols-1 gap-2">
                {['Beginners', 'Challengers', 'Masters'].map(type => (
                  <button
                    key={type}
                    onClick={() => setEditData({
                      ...editData,
                      stats: {
                        ...editData.stats,
                        skill_level: editData.stats?.skill_level ?? profile.stats.skill_level,
                        tournament_preference: type as any,
                      },
                    })}
                    className={`p-3 rounded-xl text-sm font-bold border transition-all ${
                      (editData.stats?.tournament_preference ?? profile.stats.tournament_preference) === type
                        ? 'bg-clay/10 border-clay text-clay'
                        : 'bg-white/5 border-white/5 text-gray-400'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-clay/10 border border-clay/20">
              <p className="text-clay font-black text-3xl mb-1">NTRP {profile.stats.skill_level}</p>
              <p className="text-gray-400 text-sm italic">"{SKILL_DESCRIPTIONS[profile.stats.skill_level]}"</p>
            </div>
            <div className="p-6 rounded-3xl bg-white/5 border border-white/5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Tournament Choice</p>
              <p className="text-xl font-bold text-clay">{profile.stats.tournament_preference}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
