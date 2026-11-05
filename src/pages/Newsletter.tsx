import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { SUPER_ADMIN_UID } from '../utils/eventTypes';
import { ISSUES } from './newsletter/issues';
import {
  ArticleView, BackFooter, FrontPage, ImageView, MastBar, NotFound, PhotoFocus, PuzzleView, SANS, TableView,
  type FocusMap,
} from './newsletter/NewsletterElements';

// Served Up: /newsletter (latest issue), /newsletter/:issue, /newsletter/:issue/:slug. Content is
// in newsletter/issues.ts.

// Josefin Sans is the issue's text face, bundled (no Google request). This page is lazy-loaded, so
// only newsletter readers fetch it.
import '@fontsource/josefin-sans/300.css';
import '@fontsource/josefin-sans/400.css';
import '@fontsource/josefin-sans/500.css';
import '@fontsource/josefin-sans/600.css';
import '@fontsource/josefin-sans/700.css';
import '@fontsource/josefin-sans/400-italic.css';

// Photo focus points live in newsletter/{issue number}; only the super admin may write them (rules).
function usePhotoFocus(issue: number | undefined) {
  const { user } = useAuth();
  const [focus, setFocus] = useState<FocusMap>({});
  useEffect(() => {
    if (!issue) return;
    return onSnapshot(doc(db, 'newsletter', String(issue)),
      (snap) => setFocus((snap.get('focus') as FocusMap | undefined) ?? {}),
      () => setFocus({}));
  }, [issue]);
  const nudge = useCallback((key: string, x: number, y: number) => {
    if (!issue) return;
    setFocus((f) => ({ ...f, [key]: { x, y } }));
    setDoc(doc(db, 'newsletter', String(issue)),
      { issue, focus: { [key]: { x, y } }, updated_at: serverTimestamp() }, { merge: true })
      .catch((err) => console.error('Photo focus not saved', err));
  }, [issue]);
  return { focus, nudge: user?.uid === SUPER_ADMIN_UID ? nudge : undefined };
}

export const Newsletter: React.FC = () => {
  const { issue: issueParam, slug } = useParams();

  const issue = issueParam ? ISSUES.find((i) => String(i.number) === issueParam) : ISSUES[0];
  const item = issue && slug ? issue.items.find((i) => i.slug === slug) : undefined;
  const photoFocus = usePhotoFocus(issue?.number);

  useEffect(() => {
    document.title = `${item ? `${item.headline} · ` : ''}Served Up · Racquets & Strings`;
  }, [item]);

  let body: React.ReactNode;
  if (!issue || (slug && !item)) {
    body = <NotFound to="/newsletter" />;
  } else if (!item) {
    body = <FrontPage issue={issue} issues={ISSUES} />;
  } else {
    body = (
      <>
        <MastBar issue={issue} />
        {item.kind === 'article' && <ArticleView a={item} />}
        {item.kind === 'image' && <ImageView m={item} />}
        {item.kind === 'table' && <TableView t={item} />}
        {item.kind === 'puzzle' && <PuzzleView p={item} />}
        <BackFooter issue={issue} />
      </>
    );
  }

  return (
    <div className={`${SANS} text-fg text-sm leading-normal px-4 sm:px-[3.5%] pt-5 pb-24`}>
      <PhotoFocus.Provider value={photoFocus}>
        <div className={`${item ? 'max-w-[1100px]' : 'max-w-[1200px]'} mx-auto flex flex-col gap-6`}>{body}</div>
      </PhotoFocus.Provider>
    </div>
  );
};
