import { useState } from 'react';
import { DIFFICULTY_LIST } from '../../config/difficulty';
import { AVATAR_ARCHETYPES, AVATAR_COLORS, MAX_PROFILES, profileName } from '../../progression/profile';
import { MAX_STARS, totalStars } from '../../progression/campaign';
import { store, useApp } from '../../state/store';
import type { Avatar, DifficultyId, PlayerProfile } from '../../types';
import { Button, DinoIcon, Icon, Modal, ProfileAvatar, TopBar } from '../components/common';

/** "Who is playing?" – every child has an own profile with its own progress. */
export function ProfilesScreen() {
  const profiles = useApp((s) => s.profiles);
  const active = useApp((s) => s.profile.id);
  const [editing, setEditing] = useState<PlayerProfile | 'new' | null>(null);

  return (
    <div className="screen profiles-screen" data-testid="profiles">
      <TopBar title="Kdo hraje?" icon="user" right={<span className="profiles-note">Každý má svoje dinosaury, mince a dobrodružství</span>} />
      <div className="profile-grid">
        {profiles.map((p) => (
          <div key={p.id} className={'profile-card' + (p.id === active ? ' active' : '')} style={{ ['--pc' as string]: p.avatar.color }}>
            <button type="button" className="profile-pick" data-testid={`profile-${profileName(p)}`} onClick={() => store.switchProfile(p.id)}>
              <ProfileAvatar avatar={p.avatar} size={128} />
              <span className="profile-name">{profileName(p)}</span>
              <span className="profile-stats">
                <span>
                  <Icon name="star" size={22} className="star-on" /> {totalStars(p)}/{MAX_STARS}
                </span>
                <span>
                  <Icon name="coin" size={22} /> {p.coins}
                </span>
              </span>
              {p.id === active && <span className="profile-active">Hraje teď</span>}
            </button>
            <button type="button" className="profile-edit" data-testid={`edit-profile-${profileName(p)}`} onClick={() => setEditing(p)} aria-label="Upravit">
              <Icon name="gear" size={26} />
            </button>
          </div>
        ))}
        {profiles.length < MAX_PROFILES && (
          <button type="button" className="profile-card profile-new" data-testid="new-profile" onClick={() => setEditing('new')}>
            <span className="profile-plus">
              <Icon name="plus" size={70} />
            </span>
            <span className="profile-name">Nový hráč</span>
          </button>
        )}
      </div>
      {editing && <ProfileEditor profile={editing === 'new' ? null : editing} canDelete={profiles.length > 1} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProfileEditor({ profile, canDelete, onClose }: { profile: PlayerProfile | null; canDelete: boolean; onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const [name, setName] = useState(profile ? profileName(profile) : '');
  const [avatar, setAvatar] = useState<Avatar>(profile?.avatar ?? { archetype: AVATAR_ARCHETYPES[0], color: AVATAR_COLORS[3] });
  const [difficulty, setDifficulty] = useState<DifficultyId>(settings.defaultDifficulty);
  const [confirmDelete, setConfirmDelete] = useState(0);
  const valid = name.trim().length > 0;

  const save = () => {
    if (!valid) return;
    if (profile) store.editProfile(profile.id, name, avatar);
    else {
      const p = store.createProfile(name, avatar, difficulty);
      if (p) store.switchProfile(p.id);
    }
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div className="profile-editor" data-testid="profile-editor">
        <div className="pe-head">
          <ProfileAvatar avatar={avatar} size={96} />
          <input
            data-testid="profile-name"
            value={name}
            maxLength={14}
            placeholder="Jméno"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
        <div className="pe-row">
          {AVATAR_ARCHETYPES.map((a) => (
            <button
              type="button"
              key={a}
              data-testid={`avatar-${a}`}
              className={'pe-dino' + (avatar.archetype === a ? ' selected' : '')}
              onClick={() => setAvatar({ ...avatar, archetype: a })}
            >
              <DinoIcon archetype={a} size={58} />
            </button>
          ))}
        </div>
        <div className="pe-row">
          {AVATAR_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={'pe-color' + (avatar.color === c ? ' selected' : '')}
              style={{ background: c }}
              onClick={() => setAvatar({ ...avatar, color: c })}
              aria-label={c}
            />
          ))}
        </div>
        {!profile && (
          <div className="pe-row pe-diff">
            {DIFFICULTY_LIST.map((d) => (
              <button
                type="button"
                key={d.id}
                data-testid={`new-diff-${d.id}`}
                className={'pe-chip' + (difficulty === d.id ? ' selected' : '')}
                onClick={() => setDifficulty(d.id)}
              >
                {d.name}
                <small>{d.ages}</small>
              </button>
            ))}
          </div>
        )}
        <div className="row">
          <Button color="green" size="lg" icon="check" onClick={save} disabled={!valid} testId="save-profile">
            {profile ? 'Uložit' : 'Vytvořit'}
          </Button>
          <Button color="white" size="md" onClick={onClose}>
            Zpět
          </Button>
          {profile && canDelete && (
            <Button
              color="red"
              size="md"
              icon="trash"
              testId="delete-profile"
              onClick={() => {
                if (confirmDelete === 0) setConfirmDelete(1);
                else {
                  store.deleteProfile(profile.id);
                  onClose();
                }
              }}
            >
              {confirmDelete === 0 ? 'Smazat' : 'Opravdu smazat?'}
            </Button>
          )}
        </div>
        {confirmDelete > 0 && profile && <p className="pe-warning">Smaže se všechno, co {profileName(profile)} nasbíral(a): dinosauři, mince, park i hvězdy.</p>}
      </div>
    </Modal>
  );
}
