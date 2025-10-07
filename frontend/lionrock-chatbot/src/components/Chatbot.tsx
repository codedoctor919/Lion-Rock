"use client";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, User, AlertCircle, Info, BookTemplate, ChevronDown } from "lucide-react";

type Message = {
  text: string;
  sender: "user" | "bot" | "system";
};

type UsageInfo = {
  user_id: string;
  date: string;
  prompt_count: number;
  daily_limit: number;
  remaining_quota: number;
  plan: string;
};

type PromptTemplate = {
  label: string;
  text: string;
  category: string;
  description: string;
  requiredInputs: string[];
};

// All your prompt templates (same as before)
const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Category 1: Idea Validation & Strategy
  {
    label: "Refine My Business Idea",
    text: "Act as a business strategist. Critique and refine this business idea for me. Identify its biggest strength, its biggest potential weakness, and the first step I should take to validate it: {idea}",
    category: "Idea Validation & Strategy",
    description: "Get strategic feedback on your business concept",
    requiredInputs: ["idea"]
  },
  {
    label: "Validate This Product Idea",
    text: "Act as a seasoned product manager. I have an idea for {product_idea}. Give me a framework to validate demand for this before I build it. List the top 3 questions I must answer and the quickest ways to get those answers.",
    category: "Idea Validation & Strategy",
    description: "Validate product demand before building",
    requiredInputs: ["product_idea"]
  },
  {
    label: "Analyze with SWOT",
    text: "Conduct a concise SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) for the following business concept: {business_concept}",
    category: "Idea Validation & Strategy",
    description: "Strategic analysis of your business concept",
    requiredInputs: ["business_concept"]
  },
  {
    label: "Define My Target Audience",
    text: "Help me define my ideal customer avatar for my business about {business_niche}. Describe their demographics, core pain points, and where I can find them online.",
    category: "Idea Validation & Strategy",
    description: "Create detailed customer profiles",
    requiredInputs: ["business_niche"]
  },
  {
    label: "Analyze a Competitor",
    text: "I am launching {your_offering} and my competitor is {competitor}. Perform a quick analysis of their strengths and weaknesses. What gap in their offering can I capitalize on?",
    category: "Idea Validation & Strategy",
    description: "Competitive analysis to find opportunities",
    requiredInputs: ["your_offering", "competitor"]
  },

  // Category 2: Marketing & Sales
  {
    label: "Write a Marketing Email",
    text: "Write a persuasive yet authentic marketing email to promote this offering to my target audience. Keep it concise and focus on the benefit to the reader: {offering_description}",
    category: "Marketing & Sales",
    description: "Create effective marketing emails",
    requiredInputs: ["offering_description"]
  },
  {
    label: "Craft a LinkedIn Post",
    text: "Write a compelling LinkedIn post that announces my new service, {service_name}, which helps {target_audience} achieve {key_benefit}. Make it engaging and include a clear call-to-action.",
    category: "Marketing & Sales",
    description: "Create engaging LinkedIn content",
    requiredInputs: ["service_name", "target_audience", "key_benefit"]
  },
  {
    label: "Create a Lead Magnet Idea",
    text: "Suggest 3 high-value lead magnet ideas I could create to build an email list for an audience interested in {topic_audience}.",
    category: "Marketing & Sales",
    description: "Generate lead magnet ideas",
    requiredInputs: ["topic_audience"]
  },
  {
    label: "Write a 30-Second Elevator Pitch",
    text: "Help me refine my elevator pitch. My business helps {target_audience} achieve {key_benefit} by {what_you_do}. Make it concise, compelling, and under 30 seconds.",
    category: "Marketing & Sales",
    description: "Craft a compelling elevator pitch",
    requiredInputs: ["target_audience", "key_benefit", "what_you_do"]
  },
  {
    label: "Write a Cold Outreach Email",
    text: "Draft a short, personalized cold outreach email to a potential client. My service is {service}, which solves {pain_point}. The tone should be helpful, not salesy.",
    category: "Marketing & Sales",
    description: "Create effective cold outreach emails",
    requiredInputs: ["service", "pain_point"]
  },

  // Category 3: Monetization & Operations
  {
    label: "Choose a Pricing Model",
    text: "My service is {describe_service}. Should I use subscription, one-time fee, tiered, or usage-based pricing? List the pros and cons of each for my specific model.",
    category: "Monetization & Operations",
    description: "Select the best pricing strategy",
    requiredInputs: ["describe_service"]
  },
  {
    label: "Generate Upsell Ideas",
    text: "My core offering is {core_product_service}. Suggest 3 valuable upsell or cross-sell offers I could present to customers after purchase.",
    category: "Monetization & Operations",
    description: "Create additional revenue streams",
    requiredInputs: ["core_product_service"]
  },
  {
    label: "Map a Client Onboarding Process",
    text: "Outline a simple, automated 5-step email sequence for onboarding a new client who just signed up for {service_name}.",
    category: "Monetization & Operations",
    description: "Automate client onboarding",
    requiredInputs: ["service_name"]
  },
  {
    label: "Find Efficiency Bottlenecks",
    text: "My current process for {task} is taking too long. Ask me 5 questions to help me identify the bottleneck and then suggest one tool that could automate part of it.",
    category: "Monetization & Operations",
    description: "Identify and fix process bottlenecks",
    requiredInputs: ["task"]
  },

  // Category 4: Content Creation
  {
    label: "Outline a Blog Post",
    text: "Create a detailed outline for a blog post titled '{proposed_blog_title}'. Include an introduction, key subheadings, and a conclusion that prompts engagement.",
    category: "Content Creation",
    description: "Structure your blog content",
    requiredInputs: ["proposed_blog_title"]
  },
  {
    label: "Brainstorm a YouTube Video Idea",
    text: "Suggest 3 engaging YouTube video ideas for a channel focused on {your_niche}. For each, provide a potential title and key points to cover.",
    category: "Content Creation",
    description: "Generate video content ideas",
    requiredInputs: ["your_niche"]
  },
  {
    label: "Draft a Social Media Bio",
    text: "Write a professional and catchy bio for my {platform} profile. I am a {your_role} who helps {target_audience} achieve {desired_outcome}.",
    category: "Content Creation",
    description: "Create compelling social media bios",
    requiredInputs: ["platform", "your_role", "target_audience", "desired_outcome"]
  },

  // Category 5: Execution & Productivity
  {
    label: "Find My First Customers",
    text: "Generate a list of 5 actionable strategies I could use to find my first 10 customers for a business that offers: {description_of_business}",
    category: "Execution & Productivity",
    description: "Acquire your first customers",
    requiredInputs: ["description_of_business"]
  },
  {
    label: "Create a Launch Plan",
    text: "Outline a simple, 4-week launch plan for a new digital product or service. Break it down into weekly goals and key actions. The offering is: {description_of_product_service}",
    category: "Execution & Productivity",
    description: "Plan your product launch",
    requiredInputs: ["description_of_product_service"]
  },
  {
    label: "Plan a Productive Week",
    text: "Act as a productivity coach. I need to focus on {main_goal} this week. Help me block out my calendar for deep work, administrative tasks, and client calls. Provide a sample schedule.",
    category: "Execution & Productivity",
    description: "Optimize your weekly schedule",
    requiredInputs: ["main_goal"]
  },

  // Category: Step-by-Step Execution
  {
    label: "Build a Passive Income Stream",
    text: "Act as a passive income strategist. I want to build a source of passive income related to {skill_interest}. Guide me through the step-by-step process. Start with choosing the best vehicle (digital product, affiliate site, etc.), then outline the first 5 concrete actions I must take to launch it in the next 30 days.",
    category: "Step-by-Step Execution",
    description: "Create passive income sources",
    requiredInputs: ["skill_interest"]
  },
  {
    label: "Launch My First Digital Product",
    text: "I have expertise in {expertise_area}. Walk me through a step-by-step checklist to create and launch my first digital product (e.g., an ebook, course, or template pack). Include steps for validation, creation, platform selection, pricing, and launch marketing.",
    category: "Step-by-Step Execution",
    description: "Launch your digital product",
    requiredInputs: ["expertise_area"]
  },
  {
    label: "Validate and Pre-Sell My Service",
    text: "I want to offer a service doing {service_description}. Give me a step-by-step guide to validate this idea and get pre-paid clients before I fully build out the service. Include exactly what to build (e.g., a landing page), what to say, and where to find the first 3 potential clients this week.",
    category: "Step-by-Step Execution",
    description: "Validate and pre-sell your service",
    requiredInputs: ["service_description"]
  },
  {
    label: "Automate My Client Onboarding",
    text: "My side hustle is {description}. My client onboarding process is manual and time-consuming. Provide a step-by-step plan to automate it. List the tools I need (e.g., for contracts, invoicing, communication) and the exact sequence of events from the moment a client says 'yes'.",
    category: "Step-by-Step Execution",
    description: "Automate client onboarding process",
    requiredInputs: ["description"]
  },
  {
    label: "Create a 90-Day Side Hustle Plan",
    text: "I want to go from idea to first revenue in 90 days with a side hustle in {industry_niche}. Act as my project manager and break this goal down into a quarterly roadmap. Give me specific weekly goals for Month 1 (validation), Month 2 (build), and Month 3 (launch & first sales).",
    category: "Step-by-Step Execution",
    description: "90-day side hustle roadmap",
    requiredInputs: ["industry_niche"]
  }
];

export default function ChatbotWindow() {
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hi, how can I help you today? Please enter your User ID to start chatting.", sender: "bot" },
  ]);
  const [input, setInput] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showUserIdInput, setShowUserIdInput] = useState<boolean>(true);
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const currentBotTextRef = useRef<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Group templates by category
  const templatesByCategory = PROMPT_TEMPLATES.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, PromptTemplate[]>);

  // Fetch usage information
  const fetchUsageInfo = async (userId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/usage/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setUsageInfo(data);
      }
    } catch (err) {
      console.error("Failed to fetch usage info:", err);
    }
  };

  // Format template with user inputs
  const formatTemplate = (template: PromptTemplate, inputs: Record<string, string>): string => {
    let formattedText = template.text;
    template.requiredInputs.forEach(inputKey => {
      formattedText = formattedText.replace(`{${inputKey}}`, inputs[inputKey] || '');
    });
    return formattedText;
  };

  const sendMessage = async (customMessage?: string, templateLabel?: string) => {
    const messageToSend = customMessage || input;
    if (!messageToSend.trim()) return;
    if (!userId.trim()) {
      setMessages(prev => [...prev, { 
        text: "Please enter your User ID first", 
        sender: "system" 
      }]);
      setShowUserIdInput(true);
      return;
    }

    const userMessage = messageToSend;
    setMessages((prev) => [...prev, { text: userMessage, sender: "user" }]);
    if (!customMessage) setInput("");
    setLoading(true);

    // Reset template selection if using custom message
    if (!customMessage) {
      setSelectedTemplate(null);
      setTemplateInputs({});
    }

    currentBotTextRef.current = "";

    setMessages((prev) => {
      const updated = [
        ...prev,
        { text: "", sender: "bot" as "bot" }
      ];
      return updated;
    });

    try {
      const response = await fetch("http://localhost:8000/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage, 
          user_id: userId,
          template_label: templateLabel || null  // NEW: Send template label to backend
        }),
      });

      if (!response.ok) {
        let errorMessage = "Something went wrong. Try again.";
        
        if (response.status === 429) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.detail || "Daily limit reached. Please try again tomorrow.";
          } catch {
            errorMessage = "Daily limit reached. Please try again tomorrow.";
          }
        } else if (response.status === 500) {
          errorMessage = "Server error. Please try again later.";
        } else if (response.status === 401) {
          errorMessage = "Subscription required. Please check your membership status.";
        }
        
        throw new Error(errorMessage);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let receivedValidResponse = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.replace(/^data: /, "").trim();
          if (!dataStr) continue;
          
          if (dataStr === "[DONE]") {
            setLoading(false);
            if (receivedValidResponse) {
              await fetchUsageInfo(userId);
            }
            return;
          }

          try {
            // Parse the JSON data from backend
            const data = JSON.parse(dataStr);
            
            // Handle error responses
            if (data.error) {
              setMessages((prev) => {
                const updated = [...prev];
                const lastMessage = updated[updated.length - 1];
                if (lastMessage.sender === "bot") {
                  updated[updated.length - 1] = {
                    ...lastMessage,
                    text: data.error,
                  };
                }
                return updated;
              });
              setLoading(false);
              await fetchUsageInfo(userId);
              return;
            }

            // Handle text content
            if (data.full_text) {
              receivedValidResponse = true;
              currentBotTextRef.current = data.full_text;
              
              setMessages((prev) => {
                const updated = [...prev];
                const lastMessage = updated[updated.length - 1];
                if (lastMessage.sender === "bot") {
                  updated[updated.length - 1] = {
                    ...lastMessage,
                    text: currentBotTextRef.current,
                  };
                }
                return updated;
              });
            }

            // Handle direct error messages (fallback)
            if (data.content && (
              data.content.includes("not a subscribed member") || 
              data.content.includes("Daily limit reached") ||
              data.content.includes("Please subscribe")
            )) {
              setMessages((prev) => {
                const updated = [...prev];
                const lastMessage = updated[updated.length - 1];
                if (lastMessage.sender === "bot") {
                  updated[updated.length - 1] = {
                    ...lastMessage,
                    text: data.content,
                  };
                }
                return updated;
              });
              setLoading(false);
              await fetchUsageInfo(userId);
              return;
            }

          } catch (parseError) {
            // Fallback for non-JSON responses (backward compatibility)
            if (dataStr.includes("not a subscribed member") || 
                dataStr.includes("Daily limit reached") ||
                dataStr.includes("Please subscribe")) {
              setMessages((prev) => {
                const updated = [...prev];
                const lastMessage = updated[updated.length - 1];
                if (lastMessage.sender === "bot") {
                  updated[updated.length - 1] = {
                    ...lastMessage,
                    text: dataStr,
                  };
                }
                return updated;
              });
              setLoading(false);
              await fetchUsageInfo(userId);
              return;
            }

            // If it's not an error message, treat it as regular text (backward compatibility)
            if (dataStr && dataStr !== "[DONE]") {
              receivedValidResponse = true;
              currentBotTextRef.current = dataStr;
              
              setMessages((prev) => {
                const updated = [...prev];
                const lastMessage = updated[updated.length - 1];
                if (lastMessage.sender === "bot") {
                  updated[updated.length - 1] = {
                    ...lastMessage,
                    text: currentBotTextRef.current,
                  };
                }
                return updated;
              });
            }
          }
        }
      }

      setLoading(false);
      if (receivedValidResponse) {
        await fetchUsageInfo(userId);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
      const errorMessage = err instanceof Error ? err.message : "Something went wrong. Try again.";
      
      setMessages((prev) => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage.sender === "bot" && lastMessage.text === "") {
          updated[updated.length - 1] = {
            ...lastMessage,
            text: errorMessage,
          };
        } else {
          updated.push({ text: errorMessage, sender: "system" });
        }
        return updated;
      });
      
      await fetchUsageInfo(userId);
    }
  };

  const handleUserIdSubmit = () => {
    if (userId.trim()) {
      setShowUserIdInput(false);
      fetchUsageInfo(userId);
      setMessages([{ 
        text: `User ID set to: ${userId}. You can start chatting now.`, 
        sender: "system" 
      }]);
    }
  };

  const resetUserId = () => {
    setUserId("");
    setShowUserIdInput(true);
    setUsageInfo(null);
    setMessages([]);
  };

  const handleTemplateSelect = (template: PromptTemplate) => {
    setSelectedTemplate(template);
    setTemplateInputs({});
    setShowTemplatesDropdown(false);
  };

  const handleTemplateInputChange = (inputKey: string, value: string) => {
    setTemplateInputs(prev => ({
      ...prev,
      [inputKey]: value
    }));
  };

  const executeTemplate = () => {
    if (!selectedTemplate) return;

    const missingInputs = selectedTemplate.requiredInputs.filter(
      input => !templateInputs[input]?.trim()
    );

    if (missingInputs.length > 0) {
      setMessages(prev => [...prev, { 
        text: `Please fill in: ${missingInputs.join(', ')}`, 
        sender: "system" 
      }]);
      return;
    }

    const formattedMessage = formatTemplate(selectedTemplate, templateInputs);
    sendMessage(formattedMessage, selectedTemplate.label);  // NEW: Pass template label
    setSelectedTemplate(null);
    setTemplateInputs({});
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.3 }}
      className="w-[420px] h-[600px] flex flex-col rounded-2xl shadow-2xl backdrop-blur-xl bg-white/90 border border-gray-200 overflow-hidden"
    >
      <div className="bg-[#304f74] text-white p-4 flex justify-between items-center text-lg font-semibold">
        DeepSeek Chat
        {userId && (
          <div className="flex items-center gap-2 text-sm">
            <User size={14} />
            <span>ID: {userId}</span>
            <button 
              onClick={resetUserId}
              className="text-xs bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Usage Info Bar */}
      {usageInfo && (
        <div className={`px-4 py-2 text-xs border-b ${
          usageInfo.remaining_quota === 0 
            ? "bg-red-50 border-red-200 text-red-800" 
            : usageInfo.remaining_quota <= 3
            ? "bg-yellow-50 border-yellow-200 text-yellow-800"
            : "bg-green-50 border-green-200 text-green-800"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info size={12} />
              <span className="text-black">
                {usageInfo.plan} Plan: {usageInfo.prompt_count}/{usageInfo.daily_limit} used
                {usageInfo.remaining_quota === 0 && " - Limit reached!"}
              </span>
            </div>
            <div className="font-medium text-black">
              {usageInfo.remaining_quota} remaining
            </div>
          </div>
        </div>
      )}

      {/* Template Input Form */}
      {selectedTemplate && (
        <div className="bg-blue-50 border-b border-blue-200 p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-medium text-black text-sm">Using: {selectedTemplate.label}</h4>
            <button
              onClick={() => setSelectedTemplate(null)}
              className="text-black hover:text-gray-700"
            >
              ×
            </button>
          </div>
          <div className="space-y-2">
            {selectedTemplate.requiredInputs.map((inputKey) => (
              <input
                key={inputKey}
                type="text"
                placeholder={`Enter ${inputKey.replace(/_/g, ' ')}`}
                value={templateInputs[inputKey] || ''}
                onChange={(e) => handleTemplateInputChange(inputKey, e.target.value)}
                className="w-full p-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-black placeholder-gray-500"
              />
            ))}
          </div>
          <button
            onClick={executeTemplate}
            className="w-full mt-3 bg-blue-600 text-white py-2 px-4 rounded text-sm hover:bg-blue-700 transition"
          >
            Generate Response
          </button>
        </div>
      )}

      {/* User ID Input Modal */}
      {showUserIdInput && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-6 rounded-2xl shadow-xl w-80"
          >
            <h3 className="text-lg font-semibold mb-2 text-black">Enter User ID</h3>
            <p className="text-sm text-black mb-4">
              Please enter your user ID to start chatting. This is for testing purposes.
            </p>
            <input
              type="text"
              placeholder="Enter User ID (e.g., 5)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUserIdSubmit()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm text-black placeholder-gray-500"
              autoFocus
            />
            <button
              onClick={handleUserIdSubmit}
              disabled={!userId.trim()}
              className="w-full mt-4 bg-[#304f74] text-white py-2 px-4 rounded-lg text-sm hover:bg-[#406a90] disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              Start Chatting
            </button>
          </motion.div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm bg-gray-50/70">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-2 ${
              msg.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.sender === "bot" && (
              <img
                src="/LionRock logo.png"
                alt="Bot"
                className="w-8 h-8 shadow rounded-full"
              />
            )}
            {msg.sender === "system" && (
              <AlertCircle size={16} className="text-yellow-500" />
            )}
            <div
              className={`px-4 py-2 rounded-2xl max-w-[70%] shadow ${
                msg.sender === "user"
                  ? "bg-[#5182B2] text-white rounded-br-none"
                  : msg.sender === "system"
                  ? "bg-yellow-100 text-yellow-800 border border-yellow-200 rounded-bl-none"
                  : "bg-gray-200 text-gray-800 rounded-bl-none"
              }`}
            >
              <span className="text-black">
                {msg.text ||
                  (loading && idx === messages.length - 1 && (
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          animate={{ y: [0, -4, 0] }}
                          transition={{
                            duration: 0.6,
                            repeat: Infinity,
                            repeatType: "loop",
                            delay: i * 0.2,
                            repeatDelay: 0.6,
                          }}
                          className="text-lg"
                        >
                          •
                        </motion.span>
                      ))}
                    </div>
                  ))}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex items-center border-t border-neutral-300 p-2 bg-white">
        <input
          type="text"
          placeholder={userId ? "Type your message..." : "Enter User ID first"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 px-3 py-2 text-black bg-transparent focus:outline-none text-sm disabled:text-gray-400 placeholder-gray-500"
          disabled={loading || !userId}
        />
        
        {/* Templates Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowTemplatesDropdown(!showTemplatesDropdown)}
            className="p-2 rounded-full bg-[#304f74] hover:bg-[#406a90] text-white shadow-md transition mr-2"
            disabled={loading || !userId}
          >
            <ChevronDown size={18} />
          </button>
          
          {showTemplatesDropdown && (
            <div className="absolute bottom-full right-0 mb-2 w-80 h-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-20">
              <div className="flex flex-col h-full">
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-black">Business Templates</h3>
                  <button
                    onClick={() => setShowTemplatesDropdown(false)}
                    className="text-black hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {Object.entries(templatesByCategory).map(([category, templates]) => (
                    <div key={category} className="mb-4">
                      <h4 className="font-medium text-sm text-black mb-2">{category}</h4>
                      <div className="space-y-2">
                        {templates.map((template) => (
                          <button
                            key={template.label}
                            onClick={() => handleTemplateSelect(template)}
                            className={`w-full text-left p-3 rounded-lg border text-sm transition ${
                              selectedTemplate?.label === template.label
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                          >
                            <div className="font-medium text-black">{template.label}</div>
                            <div className="text-xs text-black mt-1">{template.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => sendMessage()}
          className="p-2 rounded-full bg-[#304f74] hover:bg-[#406a90] text-white shadow-md transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          disabled={loading || !userId || !input.trim()}
        >
          <Send size={18} />
        </button>
      </div>
    </motion.div>
  );
}