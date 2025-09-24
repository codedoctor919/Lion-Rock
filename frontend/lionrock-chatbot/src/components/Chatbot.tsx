"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";

type Message = {
  text: string;
  sender: "user" | "bot";
};

export default function ChatbotWindow() {
  const [messages, setMessages] = useState<Message[]>([
    { text: "👋 Hi, how can I help you today?", sender: "bot" },
  ]);
  const [input, setInput] = useState<string>("");

  const sendMessage = () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { text: input, sender: "user" }]);
    setInput("");

    // Dummy reply (replace with DeepSeek API later)
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { text: "I'll connect to DeepSeek soon!", sender: "bot" },
      ]);
    }, 800);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.3 }}
      className="w-[420px] h-[600px] flex flex-col rounded-2xl shadow-2xl backdrop-blur-xl bg-white/90 border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className="bg-[#304f74] text-white p-4 flex justify-between items-center text-lg font-semibold">
        DeepSeek Chat
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm bg-gray-50/70">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-2 ${
              msg.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {/* Bot Avatar */}
            {msg.sender === "bot" && (
              <img
                src="/LionRock logo.png"
                alt="Bot"
                className="w-8 h-8 shadow rounded-full"
              />
            )}

            {/* Message Bubble */}
            <div
              className={`px-4 py-2 rounded-2xl max-w-[70%] shadow ${
                msg.sender === "user"
                  ? "bg-[#5182B2] text-white rounded-br-none"
                  : "bg-gray-200 text-gray-800 rounded-bl-none"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center border-t border-neutral-300 p-2 bg-white">
        <input
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 px-3 py-2 text-black bg-transparent focus:outline-none text-sm"
        />
        <button
          onClick={sendMessage}
          className="p-2 rounded-full bg-[#304f74] hover:bg-[#406a90] text-white shadow-md transition"
        >
          <Send size={18} />
        </button>
      </div>
    </motion.div>
  );
}