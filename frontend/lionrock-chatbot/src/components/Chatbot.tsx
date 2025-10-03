"use client";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";

type Message = {
  text: string;
  sender: "user" | "bot";
};

export default function ChatbotWindow() {
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hi, how can I help you today?", sender: "bot" },
  ]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Track the current bot message text separately
  const currentBotTextRef = useRef<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    setMessages((prev) => [...prev, { text: userMessage, sender: "user" }]);
    setInput("");
    setLoading(true);

    // Reset the current bot text
    currentBotTextRef.current = "";

    // Add empty bot message placeholder
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
        body: JSON.stringify({ message: userMessage,user_id: "6" }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const chunk = line.replace(/^data: /, "").trim();
          if (!chunk) continue;
          if (chunk === "[DONE]") {
            setLoading(false);
            return;
          }

          // Update the current bot text with the full response received so far
          currentBotTextRef.current = chunk;
          
          // Update the message with the current full text
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

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setMessages((prev) => [
        ...prev,
        { text: "Something went wrong. Try again.", sender: "bot" },
      ]);
    }
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
      </div>

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
            <div
              className={`px-4 py-2 rounded-2xl max-w-[70%] shadow ${
                msg.sender === "user"
                  ? "bg-[#5182B2] text-white rounded-br-none"
                  : "bg-gray-200 text-gray-800 rounded-bl-none"
              }`}
            >
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
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex items-center border-t border-neutral-300 p-2 bg-white">
        <input
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 px-3 py-2 text-black bg-transparent focus:outline-none text-sm"
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          className="p-2 rounded-full bg-[#304f74] hover:bg-[#406a90] text-white shadow-md transition"
          disabled={loading}
        >
          <Send size={18} />
        </button>
      </div>
    </motion.div>
  );
}