# ⚡ Agent Prompts — Quick Reference Cheat Sheet
# Yeh prompts copy-paste karo Antigravity Manager View mein

---

## 🔍 CODE REVIEW
```
Act as Code Reviewer Agent.
Review [FILE_NAME / this entire folder] for:
- Security vulnerabilities
- Performance issues  
- Logic errors
- Bad coding practices
Give severity level (Critical/High/Medium/Low) for each issue with fixed code.
```

---

## 🐛 ERROR SOLVING
```
Act as Error Solver Agent.
Here is my error:
[PASTE YOUR ERROR MESSAGE HERE]

My code:
[PASTE RELEVANT CODE]

Find the root cause and give me the exact fix. Also tell me how to prevent this error in future.
```

---

## 🏗️ ARCHITECTURE REVIEW
```
Act as Architecture Reviewer Agent.
Review my project's folder structure and architecture.
Check:
1. Is the folder structure scalable?
2. Are concerns properly separated?
3. Will this work at 10x current users?
4. Any design pattern improvements needed?
Give me a score out of 10 with specific recommendations.
```

---

## 🧪 TEST WRITING
```
Act as Test Writer Agent.
Write comprehensive tests for [FILE_NAME / FUNCTION_NAME]:
1. Unit tests for all functions
2. Integration tests for API endpoints
3. Edge cases and error scenarios
Use [Jest/Pytest — whichever my project uses].
Follow AAA pattern. Mock all external services.
```

---

## ✅ COMPLIANCE REVIEW
```
Act as Compliance Reviewer Agent.
Review my project for:
1. GDPR compliance (data export, deletion, consent)
2. Security (password hashing, no hardcoded secrets, PII protection)
3. Payment security (PCI-DSS basics)
Give me a compliance score and list Critical issues that must be fixed before launch.
```

---

## 🤖 ALL AGENTS TOGETHER (Full Project Review)
```
Act as Agent Watcher and coordinate a full project review.
Run all 5 agents on my codebase:
1. Code Reviewer — find bugs and security issues
2. Error Solver — check for common error-prone patterns  
3. Architecture Reviewer — evaluate structure and scalability
4. Test Writer — identify untested critical paths
5. Compliance Reviewer — check GDPR and security compliance

Start with the most critical files: auth, payments, database.
Give me a full report with priority order.
```

---

## 💡 PRO TIPS FOR ANTIGRAVITY

### Manager View mein (Agent Mode):
- Bade tasks ke liye Manager View use karo
- "Plan Mode" ON rakho — pehle plan dekhna better hai
- Ek baar mein 2-3 agents parallel chala sakte ho

### Editor View mein (Quick fixes):
- Cmd+I (Mac) / Ctrl+I (Windows) — inline quick review
- File select karo → right click → "Review with AI"

### Best Practices:
- Pehle Architecture Review karo (foundation check)
- Phir Code Review (quality check)  
- Phir Test Writer (coverage add karo)
- Phir Compliance Review (launch se pehle)
- Error Solver — jab bhi koi error aaye
- Agent Watcher — weekly full project health check