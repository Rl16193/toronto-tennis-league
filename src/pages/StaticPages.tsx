import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, FileText, Gavel, CheckCircle2, Mail, MessageSquare } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const PageWrapper: React.FC<{ title: string; icon: any; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div className="text-center space-y-6">
        <div className="w-20 h-20 clay-gradient rounded-3xl mx-auto flex items-center justify-center shadow-2xl">
          <Icon className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-5xl md:text-6xl font-display font-black text-white tracking-tight">{title}</h1>
        <div className="h-1.5 w-24 clay-gradient mx-auto rounded-full" />
      </div>
      <div className="bg-tennis-surface/30 border border-white/5 p-10 md:p-16 rounded-[3rem] shadow-2xl prose prose-invert prose-clay max-w-none">
        {children}
      </div>
    </motion.div>
  </div>
);

export const Rules: React.FC = () => (
  <PageWrapper title="League Rules" icon={Gavel}>
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-3xl font-bold text-white flex items-center">
          <CheckCircle2 className="w-6 h-6 mr-3 text-clay" />
          1. Sportsmanship and Match Play
        </h2>
        <p className="text-gray-400 leading-relaxed text-lg">
          Toronto Tennis League is built on fair play, respect, and player-led coordination. All members are expected to treat opponents, partners, and the public courteously and to resolve issues calmly and in good faith.
        </p>
        <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
          <li>Treat others with respect and avoid harassment, aggression, or abusive language.</li>
          <li>Follow public court rules, booking limits, and time restrictions.</li>
          <li>Keep courts and shared spaces clean and leave them in good condition.</li>
          <li>Players are responsible for bringing their own tennis balls unless otherwise arranged.</li>
          <li>Toronto Tennis League does not officiate matches, reserve courts, or supervise play unless explicitly stated for a specific event.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-3xl font-bold text-white flex items-center">
          <CheckCircle2 className="w-6 h-6 mr-3 text-clay" />
          2. Match Format and Disputes
        </h2>
        <p className="text-gray-400 leading-relaxed text-lg">
          Unless an event or organizer states otherwise, league matches follow standard community match conventions designed to keep play competitive and practical.
        </p>
        <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
          <li>Matches are generally best of 3 tie-breaks.</li>
          <li>If the match is tied 1 all, the third tie-break is a super tie-break to 10 points.</li>
          <li>Each tie-break must be won by 2 points.</li>
          <li>Players make their own line calls and are expected to do so honestly and respectfully.</li>
          <li>If there is a dispute, players may agree to replay the point. A forced point replay cannot be used on match point, set point, or a point before match point or set point, and is limited to one per set.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-3xl font-bold text-white flex items-center">
          <CheckCircle2 className="w-6 h-6 mr-3 text-clay" />
          3. Ratings and Fair Competition
        </h2>
        <p className="text-gray-400 leading-relaxed text-lg">
          Players are expected to provide an honest self-assessment of their NTRP or skill level and to join matches, events, and divisions that fit their current level of play.
        </p>
        <ul className="list-disc list-inside text-gray-400 space-y-2 ml-4">
          <li>Do not intentionally understate or overstate your level to gain an advantage.</li>
          <li>Toronto Tennis League may review and adjust ratings or event placement where needed to support fair and balanced competition.</li>
          <li>Repeated misrepresentation of skill level or unsportsmanlike conduct may lead to warnings, removal from events, or account suspension.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-3xl font-bold text-white flex items-center">
          <CheckCircle2 className="w-6 h-6 mr-3 text-clay" />
          4. Enforcement
        </h2>
        <p className="text-gray-400 leading-relaxed text-lg">
          We want the community to feel welcoming, safe, and well-run. We may issue warnings, remove members from specific events, or suspend access to the Platform if conduct falls below community expectations.
        </p>
      </section>
    </div>
  </PageWrapper>
);

export const Terms: React.FC = () => (
  <PageWrapper title="Terms of Service" icon={FileText}>
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">1. Acceptance of Terms</h2>
        <p className="text-gray-400 leading-relaxed">
          By accessing or using the Toronto Tennis League platform (the "Platform"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with these Terms, you should not access or use the Platform.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">2. About the Platform</h2>
        <p className="text-gray-400 leading-relaxed">
          Toronto Tennis League is a community-driven, non-profit platform designed to help players connect and participate in matches, meetups, and tournaments. Unless explicitly stated for a specific event or service, we do not act as referees, supervisors, or organizers of play, and we do not reserve courts on behalf of users.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">3. Eligibility</h2>
        <p className="text-gray-400 leading-relaxed">
          You must be at least 14 years old to use the Platform. If you are under the age of majority in your jurisdiction, you confirm that you have permission from a parent or legal guardian to use the Platform and participate in any activities arranged through it.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">4. User Accounts</h2>
        <p className="text-gray-400 leading-relaxed">
          You are responsible for maintaining the confidentiality of your account credentials and for keeping your account information accurate, complete, and current. You are also responsible for activity that occurs under your account where permitted by law.
        </p>
        <p className="text-gray-400 leading-relaxed">
          We may suspend or terminate accounts at our discretion where users violate these Terms, provide false or misleading information, misuse the Platform, or engage in harmful, unsafe, or inappropriate behavior.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">5. Assumption of Risk</h2>
        <p className="text-gray-400 leading-relaxed">
          Tennis, training, and related physical activities involve inherent risks, including the risk of injury, illness, collision, weather-related hazards, and other unforeseen conditions. By participating in a match, meetup, tournament, or other activity arranged through the Platform, you acknowledge that participation is voluntary, that you are responsible for your own physical condition and readiness to play, and that you accept the risks associated with participation.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">6. Liability Waiver and Platform Limitations</h2>
        <p className="text-gray-400 leading-relaxed">
          To the fullest extent permitted by law, Toronto Tennis League is not responsible for injuries, accidents, disputes between players, missed connections, scheduling conflicts, cancellations, weather issues, court conditions, lost property, or the conduct of users or third parties.
        </p>
        <p className="text-gray-400 leading-relaxed">
          The Platform is provided on an "as is" and "as available" basis for community use. We do not guarantee the availability of matches or opponents, the accuracy of user-provided information, uninterrupted service, or that the Platform will always be error-free or secure.
        </p>
        <p className="text-gray-400 leading-relaxed">
          By using the Platform, you agree to release and hold harmless Toronto Tennis League and its volunteers, organizers, and representatives from claims, damages, losses, or liabilities arising from or related to your participation, except where such limitation is prohibited by law.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">7. User Conduct</h2>
        <p className="text-gray-400 leading-relaxed">
          You agree to use the Platform respectfully and lawfully. You must not harass others, impersonate any person, submit misleading information, interfere with the operation of the Platform, or use the community in a way that harms players, organizers, or public spaces.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">8. Termination</h2>
        <p className="text-gray-400 leading-relaxed">
          We reserve the right to suspend, restrict, or terminate access to the Platform at any time where we reasonably believe it is necessary to protect the community, enforce these Terms, or address misuse or safety concerns.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">9. Governing Law</h2>
        <p className="text-gray-400 leading-relaxed">
          These Terms are governed by the laws of Ontario, Canada, without regard to conflict of law principles.
        </p>
      </section>
    </div>
  </PageWrapper>
);

export const Privacy: React.FC = () => (
  <PageWrapper title="Privacy Policy" icon={Shield}>
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">1. Information We Collect</h2>
        <p className="text-gray-400 leading-relaxed">
          We collect information you provide directly to us when you create an account, complete your profile, join an event, contact us, or otherwise use the Platform. This may include your name, email address, phone number, tennis preferences, skill level, scheduling details, event participation details, and any information you choose to submit in messages or profile fields.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">2. How We Use Your Information</h2>
        <p className="text-gray-400 leading-relaxed">
          We use your information to operate and improve the Platform, create and manage accounts, facilitate matches and events, connect you with other players, respond to inquiries, communicate updates, and support the safety, reliability, and fair operation of the community.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">3. Data Sharing</h2>
        <p className="text-gray-400 leading-relaxed">
          We do not sell your personal information. We may share relevant profile or contact information with other participants when you join a match, meetup, tournament, or event and that information is reasonably needed for coordination. We may also use third-party service providers, such as authentication, database, storage, analytics, or hosting tools, to help operate the Platform.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">4. Storage and Security</h2>
        <p className="text-gray-400 leading-relaxed">
          Your information may be stored and processed using third-party services, including cloud-based databases, file storage, and authentication providers. We take reasonable steps to protect your information, but no method of transmission, storage, or security is completely secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">5. Your Responsibilities</h2>
        <p className="text-gray-400 leading-relaxed">
          You are responsible for maintaining the confidentiality of your account credentials and for being thoughtful about what personal information you choose to share with other users through the Platform or during event coordination.
        </p>
      </section>
    </div>
  </PageWrapper>
);

export const Contact: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [subjectValue, setSubjectValue] = useState('Meetups');

  const subject = encodeURIComponent(`Toronto Tennis League - ${subjectValue}`);
  const body = encodeURIComponent(
    `Hi Toronto Tennis League,\n\nSubject: ${subjectValue}\n\nMessage:\n${message}\n`
  );

  const handleSendMessage = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    // The mailto link will be handled by the anchor
  };

  return (
    <PageWrapper title="Contact Us" icon={Mail}>
      <div className="space-y-10">
        <section className="space-y-4">
          <h2 className="text-3xl font-bold text-white flex items-center">
            <MessageSquare className="w-6 h-6 mr-3 text-clay" />
            Event Requests and Feedback
          </h2>
          <p className="text-gray-400 leading-relaxed text-lg">
            Want to create an event? Contact us to learn more. Tell us about the type of event you want to organize, whether it is a meetup or tournament, or send us general feedback.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-6">
          <div className="rounded-[2rem] border border-white/5 bg-white/5 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Email</p>
            <a href="mailto:tenniscommunity.tbtc@gmail.com" className="text-clay text-lg font-bold hover:underline">
              tenniscommunity.tbtc@gmail.com
            </a>
          </div>
        </section>

        <section className="rounded-[2rem] border border-clay/20 bg-clay/5 p-6 space-y-4">
          <p className="text-white font-semibold">
            Tell us about the type of event you want to organize: meetups, tournaments, or provide general feedback.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Subject</label>
              <select
                value={subjectValue}
                onChange={(e) => setSubjectValue(e.target.value)}
                className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white focus:border-clay outline-none"
              >
                <option value="Meetups">Meetups</option>
                <option value="Tournaments">Tournaments</option>
                <option value="General Feedback">General Feedback</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white placeholder-gray-500 focus:border-clay outline-none resize-none"
                placeholder="Share the kind of event you want to organize, preferred timing, location ideas, or any general feedback."
              />
            </div>
          </div>
          <a
            href={user ? `mailto:tenniscommunity.tbtc@gmail.com?subject=${subject}&body=${body}` : undefined}
            onClick={!user ? handleSendMessage : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-2xl bg-clay hover:bg-clay-dark text-white shadow-lg shadow-clay/20 px-6 py-2.5 font-semibold transition-all duration-200"
          >
            Send Message
          </a>
        </section>
      </div>
    </PageWrapper>
  );
};
