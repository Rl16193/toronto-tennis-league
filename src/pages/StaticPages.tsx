import React from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Shield, FileText, Mail, MessageSquare,
  UserPlus, CalendarPlus, MessageCircle, Handshake, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CONTACT_EMAIL, InstagramLink, PRIVACY_EFFECTIVE, WHATSAPP_URL } from '../components/FooterElements';


const PageWrapper: React.FC<{ title?: string; icon?: any; boxed?: boolean; children: React.ReactNode }> = ({ title, icon: Icon, boxed = true, children }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12"
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-fg/70 hover:text-fg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />Back
        </button>

        {title && (
          <div className="text-center space-y-6">
            {Icon && (
              <div className="w-20 h-20 clay-gradient rounded-2xl mx-auto flex items-center justify-center shadow-2xl">
                <Icon className="w-10 h-10 text-white" />
              </div>
            )}
            <h1 className="text-3xl font-display font-black text-fg tracking-tight">{title}</h1>
            <div className="h-1.5 w-24 clay-gradient mx-auto rounded-full" />
          </div>
        )}
        {boxed ? (
          <div className="bg-fg/5 p-6 sm:p-8 rounded-2xl prose prose-invert prose-clay max-w-none">
            {children}
          </div>
        ) : (
          <div className="prose prose-invert prose-clay max-w-none">{children}</div>
        )}

        <div className="flex items-center justify-center gap-6 text-sm font-semibold">
          <Link to={user ? '/profile' : '/login'} className="text-fg/70 hover:text-clay transition-colors">Profile</Link>
          <span className="text-fg/70">·</span>
          <InstagramLink className="text-fg/70" />
        </div>
      </motion.div>
    </div>
  );
};

const HOW_IT_WORKS: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; href?: string }[] = [
  { icon: UserPlus, title: 'Create your profile', desc: 'Tell us your skill level, preferred courts and availability.' },
  { icon: CalendarPlus, title: 'Join an event', desc: 'Pick a league or event that fits your level and schedule.' },
  { icon: MessageCircle, title: 'Join the WhatsApp community', desc: 'Stay in the loop and find hitting partners.', href: WHATSAPP_URL },
  { icon: Handshake, title: 'Connect & schedule', desc: 'Meet other members and arrange your matches.' },
];

const ABOUT_TABS = [
  {
    id: 'intro',
    label: 'About Us',
    image: null as string | null,
    body: 'A one stop shop for everything tennis, from tournaments, socials, and winter court bookings to a '
      + 'marketplace for used equipment, equipment rentals, information on coaches, and a local newsletter.',
  },
  {
    id: 'vision',
    label: 'Vision',
    image: 'https://firebasestorage.googleapis.com/v0/b/toronto-tennis-league.firebasestorage.app/o/Gallery%2F10.png?alt=media',
    body: 'To democratize the world’s healthiest sport by building a global network of connected players that '
      + 'transforms underutilized public courts into inclusive hubs and use community driven data to advocate for '
      + 'first class public recreational infrastructure, starting with Toronto as our pilot.',
  },
  {
    id: 'mission',
    label: 'Mission',
    image: 'https://firebasestorage.googleapis.com/v0/b/toronto-tennis-league.firebasestorage.app/o/Gallery%2F11.png?alt=media',
    body: 'Our mission is to break down the financial and social barriers of tennis by bringing club level '
      + 'experience, organized events, socials, and competitive play directly to public courts. By mobilizing our '
      + 'community, we foster social inclusion and physical well being while equipping players with the tools to '
      + 'document court conditions, translating collective player data into actionable advocacy for park revitalization.',
  },
];

// Retired as a standalone page; its content now lives on About Us. Kept as a redirect so
// existing links and bookmarks to /how-it-works still land somewhere useful.
export const HowItWorks: React.FC = () => <Navigate to="/about" replace />;

export const About: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState(ABOUT_TABS[0].id);
  React.useEffect(() => { document.title = 'About Us · Racquets & Strings'; }, []);
  const tab = ABOUT_TABS.find((t) => t.id === activeTab)!;
  return (
    <PageWrapper boxed={false}>
      <div className="space-y-10">
        <div className="not-prose">
          <div className="flex flex-col gap-2 mb-4">
            {ABOUT_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`w-full text-left px-4 py-3 rounded-2xl font-bold text-sm transition-colors ${
                  t.id === activeTab ? 'bg-clay text-white' : 'bg-fg/5 text-fg hover:bg-fg/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 rounded-2xl bg-fg/5">
            {tab.id === 'intro' ? (
              <div className="mb-4 text-center">
                <span className="text-lg font-black font-display tracking-tight">
                  <span className="text-fg">RACQUETS</span><span className="text-clay"> &amp; </span><span className="text-fg">STRINGS</span>
                </span>
                <p className="text-clay font-bold text-xs tracking-widest uppercase mt-1">L&apos;&OElig;UF FOR THE GAME</p>
              </div>
            ) : (
              <img src={tab.image!} alt={tab.label} className="w-full h-40 object-cover rounded-2xl mb-4" />
            )}
            <p className="text-fg text-sm leading-relaxed text-justify">{tab.body}</p>
          </div>
        </div>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-fg">Get Started</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose">
            {HOW_IT_WORKS.map((step, i) => {
              const inner = (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-2xl bg-clay/15 border border-clay/30 flex items-center justify-center shrink-0">
                      <step.icon className="w-5 h-5 text-clay" />
                    </div>
                    <span className="text-fg/70 font-black text-lg">{i + 1}</span>
                  </div>
                  <h3 className="text-fg font-bold mb-1.5">{step.title}</h3>
                  <p className="text-fg/70 text-sm leading-relaxed">{step.desc}</p>
                </>
              );
              const cls = 'p-5 rounded-2xl bg-fg/5 h-full block';
              // Members-only links (e.g. WhatsApp community) render as a plain, non-clickable
              // card for logged-out visitors — no link is exposed until they're signed in.
              return step.href && user ? (
                <a key={i} href={step.href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:border-clay/30 transition-colors`}>
                  {inner}
                </a>
              ) : (
                <div key={i} className={cls}>{inner}</div>
              );
            })}
          </div>
        </section>
      </div>
    </PageWrapper>
  );
};

export const Terms: React.FC = () => (
  <PageWrapper title="Terms of Service" icon={FileText}>
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">1. Acceptance of Terms</h2>
        <p className="text-fg leading-relaxed">
          By accessing or using the Racquets & Strings platform (the "Platform"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with these Terms, you should not access or use the Platform.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">2. About the Platform</h2>
        <p className="text-fg leading-relaxed">
          Racquets & Strings is a community-driven, non-profit platform designed to help players connect and participate in matches, meetups, and tournaments. Unless explicitly stated for a specific event or service, we do not act as referees, supervisors, or organizers of play, and we do not reserve courts on behalf of users.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">3. Eligibility</h2>
        <p className="text-fg leading-relaxed">
          You must be at least 17 years old to use the Platform. If you are under the age of majority in your jurisdiction, you confirm that you have permission from a parent or legal guardian to use the Platform and participate in any activities arranged through it.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">4. User Accounts</h2>
        <p className="text-fg leading-relaxed">
          You are responsible for maintaining the confidentiality of your account credentials and for keeping your account information accurate, complete, and current. You are also responsible for activity that occurs under your account where permitted by law.
        </p>
        <p className="text-fg leading-relaxed">
          We may suspend or terminate accounts at our discretion where users violate these Terms, provide false or misleading information, misuse the Platform, or engage in harmful, unsafe, or inappropriate behavior.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">5. Assumption of Risk</h2>
        <p className="text-fg leading-relaxed">
          Tennis, training, and related physical activities involve inherent risks, including the risk of injury, illness, collision, weather-related hazards, and other unforeseen conditions. By participating in a match, meetup, tournament, or other activity arranged through the Platform, you acknowledge that participation is voluntary, that you are responsible for your own physical condition and readiness to play, and that you accept the risks associated with participation.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">6. Liability Waiver and Platform Limitations</h2>
        <p className="text-fg leading-relaxed">
          To the fullest extent permitted by law, Racquets & Strings is not responsible for injuries, accidents, disputes between players, missed connections, scheduling conflicts, cancellations, weather issues, court conditions, lost property, or the conduct of users or third parties.
        </p>
        <p className="text-fg leading-relaxed">
          The Platform is provided on an "as is" and "as available" basis for community use. We do not guarantee the availability of matches or opponents, the accuracy of user-provided information, uninterrupted service, or that the Platform will always be error-free or secure.
        </p>
        <p className="text-fg leading-relaxed">
          By using the Platform, you agree to release and hold harmless Racquets & Strings and its volunteers, organizers, and representatives from claims, damages, losses, or liabilities arising from or related to your participation, except where such limitation is prohibited by law.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">7. User Conduct</h2>
        <p className="text-fg leading-relaxed">
          You agree to use the Platform respectfully and lawfully. You must not harass others, impersonate any person, submit misleading information, interfere with the operation of the Platform, or use the community in a way that harms players, organizers, or public spaces.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">8. Termination</h2>
        <p className="text-fg leading-relaxed">
          We reserve the right to suspend, restrict, or terminate access to the Platform at any time where we reasonably believe it is necessary to protect the community, enforce these Terms, or address misuse or safety concerns.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg">9. Governing Law</h2>
        <p className="text-fg leading-relaxed">
          These Terms are governed by the laws of Ontario, Canada, without regard to conflict of law principles.
        </p>
      </section>
    </div>
  </PageWrapper>
);

// The policy text. Change PRIVACY_EFFECTIVE (FooterElements.tsx) with any material change: members re-agree.
const PRIVACY_SECTIONS: { title: string; body: (string | string[])[] }[] = [
  {
    title: 'Who Is Responsible',
    body: [
      'Racquets & Strings is responsible for the personal information it holds. Our privacy contact is Rahul Tirath Lal: email rahultirath.lal@gmail.com, phone 416-697-4951. Questions, requests and complaints go to them.',
    ],
  },
  {
    title: 'Who Can Use It',
    body: [
      'You must be 17 or older to create an account. You confirm your age when you sign up.',
    ],
  },
  {
    title: 'What We Collect and Why',
    body: [
      'We collect only what we need to run the league and the community:',
      [
        'Account and profile: name, sign-in email, photo, bio, skill level, league, preferred courts and zone, and availability. These are used to place you in draws, ladders and match suggestions.',
        'Contact details: email, phone and WhatsApp, so the players you are scheduled to play can reach you.',
        'Play: match results, scores, league points, and the events you join.',
        'Court activity: check-ins (including the location you checked in from, used to confirm you are at the court), court-condition, waiting-board and queue reports, and any photos you attach.',
        'Marketplace and services: your listings, and bookings with stringers and coaches.',
        'Newsletter and volunteering: the email (and note) you give us. A court report made while signed out may include an email, which joins the newsletter list.',
      ],
    ],
  },
  {
    title: 'Consent',
    body: [
      'You agree to this policy when you create an account, and we record when you did. If we change it in a way that matters, we ask you again.',
      'When you join an event, you agree to be contacted about it, by email, text or WhatsApp, and to have your contact details shared with your opponents so the event can go ahead.',
      'You can withdraw consent at any time by deleting your account (see "Your Rights"), or by turning off email notifications or unsubscribing from the newsletter, which we only send to people who signed up for it.',
    ],
  },
  {
    title: 'What Is Public and Who Sees What',
    body: [
      [
        'Public: your name, photo, bio, badges, results, league points and rankings, and the text and photos of court reports (without your name). When you were last active is not public.',
        'Members you play, partner with or book: your contact details, and only theirs. This includes doubles partners and players looking for a partner in the same event.',
        'Marketplace: while you have a listing, signed-in members can see your contact details.',
        'Organizers: what they need to run events and review results.',
      ],
      'We do not sell your personal information.',
    ],
  },
  {
    title: 'Service Providers and Where Data Is Stored',
    body: [
      'We use Google Firebase (sign-in, database, file storage and hosting), Google Analytics (how the site is used), Resend (email), Twilio (text and WhatsApp messages about your matches; WhatsApp is run by Meta), Brevo (the newsletter), and Google Sheets (an internal copy for organizers, refreshed weekly). Your information is stored and processed in the United States, where it may be accessible to authorities under US law.',
    ],
  },
  {
    title: 'Analytics and Cookies',
    body: [
      'Google Analytics sets cookies in your browser and records the pages you visit and what you do on them. When you are signed in, it links that activity to your account id (not your name or email). We use it only to understand how the site is used and to improve it.',
      'You can block or delete these cookies in your browser settings, or with an ad or tracker blocker. The site works without them.',
    ],
  },
  {
    title: 'How Long We Keep It',
    body: [
      [
        'Your account, profile and contact details: until you delete your account.',
        'Match results and league points: kept for league history. When you delete your account they stay under "Former member", with your name removed.',
        'Check-in location: the location you checked in from is cleared after 30 days. The visit itself, and any score you recorded, stays.',
        'Notifications: removed 24 hours after you read them, and after 30 days at the latest.',
        'Newsletter and volunteer sign-ups: until you unsubscribe or ask us to remove them.',
        'We keep no backups, so deleted information cannot be restored.',
      ],
    ],
  },
  {
    title: 'Your Rights',
    body: [
      `You can see and correct most of your information on your Profile. To get a copy of everything we hold about you, write to ${CONTACT_EMAIL}. We reply within 30 days.`,
      'You can delete your account yourself from Profile → Delete account. Your profile, contact details, preferences, photos, listings and sign-in are deleted, and your name is removed from everything that stays (results, points, bookings, claims). Unplayed tournament matches become walkovers for your opponents.',
    ],
  },
  {
    title: 'Safeguards',
    body: [
      'Access is controlled by database security rules: contact details are readable only by the people listed above, and results and points are written only by our servers. No method of storage or transmission is completely secure, so we cannot promise absolute security.',
    ],
  },
  {
    title: 'Complaints',
    body: [
      `Tell us first at ${CONTACT_EMAIL}. If you are not satisfied with our answer, you can complain to the Office of the Privacy Commissioner of Canada (priv.gc.ca).`,
    ],
  },
];

export const Privacy: React.FC = () => (
  <PageWrapper title="Privacy Policy" icon={Shield}>
    <div className="space-y-10">
      <p className="text-sm text-fg/70">
        Effective {PRIVACY_EFFECTIVE.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}. Written to follow
        Canada's Personal Information Protection and Electronic Documents Act (PIPEDA).
      </p>
      {PRIVACY_SECTIONS.map((s, i) => (
        <section key={s.title} className="space-y-4">
          <h2 className="text-2xl font-bold text-fg">{i + 1}. {s.title}</h2>
          {s.body.map((p, j) => (
            Array.isArray(p)
              ? <ul key={j} className="list-disc pl-5 space-y-1.5 text-fg leading-relaxed">{p.map((li) => <li key={li}>{li}</li>)}</ul>
              : <p key={j} className="text-fg leading-relaxed">{p}</p>
          ))}
        </section>
      ))}
    </div>
  </PageWrapper>
);

export const Contact: React.FC = () => (
  <PageWrapper title="Contact Us" icon={Mail}>
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-fg flex items-center">
          <MessageSquare className="w-5 h-5 mr-3 text-clay" />
          Get in Touch
        </h2>
        <p className="text-fg/70 leading-relaxed">
          Want to create an event or provide feedback? Reach out via email or Instagram.
        </p>
      </section>
      <section className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl bg-fg/5 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-fg/70 mb-2">Email</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-clay font-bold hover:underline break-all">
            {CONTACT_EMAIL}
          </a>
        </div>
        <div className="rounded-2xl bg-fg/5 p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-fg/70 mb-2">Instagram</p>
          <InstagramLink className="text-clay font-bold" />
        </div>
      </section>
    </div>
  </PageWrapper>
);
