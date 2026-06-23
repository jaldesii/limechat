import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./FAQ.scss";

// ✅ SVG Icons
function ChevronDownIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>);}
function ChatIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);}
function ShieldIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);}
function UsersIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);}
function BellIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>);}
function HeartIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>);}
function MoonIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>);}
function PhoneIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12" y2="18.01" /></svg>);}
function ReplyIcon() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>);}

// ✅ FAQ Data
const faqData = [
  {
    category: "Getting Started",
    icon: <ChatIcon />,
    questions: [
      {
        q: "What is LimeChat?",
        a: "LimeChat is an anonymous chat platform that connects you randomly with people near your location. No sign-ups, no profiles — just real conversations."
      },
      {
        q: "How do I start chatting?",
        a: "Simply enter your name and location on the profile page, choose 1v1 or Group Chat mode, and you'll be matched instantly."
      },
      {
        q: "Do I need to create an account?",
        a: "No! LimeChat is 100% anonymous. No email, phone number, or password required. Just enter a display name and start chatting."
      },
      {
        q: "Is LimeChat free?",
        a: "Yes! LimeChat is completely free forever. No hidden fees, no premium subscriptions."
      },
    ]
  },
  {
    category: "Privacy & Safety",
    icon: <ShieldIcon />,
    questions: [
      {
        q: "Are my messages stored?",
        a: "No. Messages are never stored on our servers. Once a chat ends, all messages are permanently deleted."
      },
      {
        q: "Can people see my real identity?",
        a: "No. LimeChat is 100% anonymous. Only the display name you enter is shown to your chat partner."
      },
      {
        q: "Is my location tracked?",
        a: "You only enter the location you want to share. We don't track your GPS or real location."
      },
      {
        q: "What should I do if someone is harassing me?",
        a: "Simply click 'Skip' or 'Leave' to end the conversation immediately. You won't be matched with the same person again."
      },
    ]
  },
  {
    category: "Chat Features",
    icon: <ReplyIcon />,
    questions: [
      {
        q: "How do I reply to a specific message?",
        a: "Click the reply icon on any message bubble, or swipe left on mobile to quote-reply to that message."
      },
      {
        q: "How do message reactions work?",
        a: "Double-tap any message bubble to send a heart reaction. It shows on both your screen and your partner's."
      },
      {
        q: "Can I change message spacing?",
        a: "Yes! Click the spacing toggle button in the chat header to switch between compact and comfortable spacing."
      },
      {
        q: "How do I skip to a new partner?",
        a: "Click the 'Skip' button to end the current conversation and find someone new instantly."
      },
    ]
  },
  {
    category: "Group Chat",
    icon: <UsersIcon />,
    questions: [
      {
        q: "How do group chats work?",
        a: "On the profile page, select 'Group Chat' mode. You can create a new group or join an existing one. Groups support up to 10 members."
      },
      {
        q: "How many people can join a group?",
        a: "Each group can have up to 10 members. If a group is full, you'll need to wait or create a new one."
      },
      {
        q: "Can I see who's in the group?",
        a: "Yes! Click the members button in the chat header to open the sidebar and see all group members."
      },
      {
        q: "What happens when I leave a group?",
        a: "You'll be removed from the group immediately. The group continues for remaining members unless you were the last one."
      },
    ]
  },
  {
    category: "Announcements",
    icon: <BellIcon />,
    questions: [
      {
        q: "What are announcements?",
        a: "Announcements are broadcast messages sent by the admin to all active users. They appear at the top of the chat screen."
      },
      {
        q: "How can I post an announcement?",
        a: "Contact the admin via Telegram (@admlimech) to inquire about posting announcements. This is a paid feature."
      },
      {
        q: "How long do announcements last?",
        a: "Announcements can be set with a timer. They automatically disappear when the timer expires."
      },
    ]
  },
  {
    category: "App & Technical",
    icon: <PhoneIcon />,
    questions: [
      {
        q: "Can I install LimeChat on my phone?",
        a: "Yes! Click 'Install App' on the home page or use 'Add to Home Screen' on iOS/Android for a native app experience."
      },
      {
        q: "Does LimeChat work on desktop?",
        a: "Yes! LimeChat works on any browser — desktop, tablet, or mobile."
      },
      {
        q: "Is there a dark mode?",
        a: "Yes! Click the moon/sun icon in the top navigation bar to toggle between light and dark mode."
      },
      {
        q: "My messages aren't sending. What should I do?",
        a: "Check your internet connection. If the problem persists, try refreshing the page or clearing your browser cache."
      },
    ]
  },
  {
    category: "Support",
    icon: <HeartIcon />,
    questions: [
      {
        q: "How do I report a bug?",
        a: "Contact the admin on Telegram (@admlimech) with details about the bug. Screenshots help!"
      },
      {
        q: "Can I suggest new features?",
        a: "Absolutely! DM @admlimech on Telegram with your suggestions. We love feedback!"
      },
      {
        q: "How do I contact support?",
        a: "Reach out via Telegram: @admlimech. We respond within 24 hours."
      },
    ]
  },
];

function AccordionItem({ question, answer, isOpen, onClick }) {
  return (
    <div className={`faq__item ${isOpen ? 'faq__item--open' : ''}`}>
      <button className="faq__question" onClick={onClick}>
        <span>{question}</span>
        <span className={`faq__chevron ${isOpen ? 'faq__chevron--open' : ''}`}>
          <ChevronDownIcon />
        </span>
      </button>
      <div className={`faq__answer-wrapper ${isOpen ? 'faq__answer-wrapper--open' : ''}`}>
        <p className="faq__answer">{answer}</p>
      </div>
    </div>
  );
}

export default function FAQ() {
  const navigate = useNavigate();
  const [openItems, setOpenItems] = useState({});
  const [activeCategory, setActiveCategory] = useState(faqData[0].category);

  const toggleItem = (categoryIndex, questionIndex) => {
    const key = `${categoryIndex}-${questionIndex}`;
    setOpenItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isOpen = (categoryIndex, questionIndex) => {
    const key = `${categoryIndex}-${questionIndex}`;
    return openItems[key] || false;
  };

  return (
    <div className="faq">
      <div className="faq__container">
        {/* Header */}
        <div className="faq__header">
          <button className="faq__back" onClick={() => navigate('/')}>
            ← Back to Home
          </button>
          <h1 className="faq__title">Frequently Asked Questions</h1>
          <p className="faq__subtitle">Everything you need to know about LimeChat</p>
        </div>

        {/* Category Tabs */}
        <div className="faq__categories">
          {faqData.map((cat, i) => (
            <button
              key={i}
              className={`faq__category-btn ${activeCategory === cat.category ? 'faq__category-btn--active' : ''}`}
              onClick={() => setActiveCategory(cat.category)}
            >
              <span className="faq__category-icon">{cat.icon}</span>
              <span className="faq__category-name">{cat.category}</span>
            </button>
          ))}
        </div>

        {/* FAQ Content */}
        <div className="faq__content">
          {faqData.map((cat, catIndex) => (
            <div
              key={catIndex}
              className={`faq__section ${activeCategory === cat.category ? 'faq__section--active' : ''}`}
            >
              <h2 className="faq__section-title">
                <span className="faq__section-icon">{cat.icon}</span>
                {cat.category}
              </h2>
              <div className="faq__list">
                {cat.questions.map((item, qIndex) => (
                  <AccordionItem
                    key={qIndex}
                    question={item.q}
                    answer={item.a}
                    isOpen={isOpen(catIndex, qIndex)}
                    onClick={() => toggleItem(catIndex, qIndex)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="faq__cta">
          <p className="faq__cta-text">Still have questions?</p>
          <a
            href="https://t.me/admlimech"
            target="_blank"
            rel="noopener noreferrer"
            className="faq__cta-btn"
          >
            Contact Us on Telegram
          </a>
        </div>
      </div>
    </div>
  );
}