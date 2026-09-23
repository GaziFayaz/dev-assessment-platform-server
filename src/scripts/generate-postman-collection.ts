import fs from "fs";
import path from "path";

// Helper to create test script for sign-in
const makeAuthTestScript = (persona: string) => [
  `// Auto-save session token from Better Auth sign-in response`,
  `if (pm.response.code === 200) {`,
  `    const res = pm.response.json();`,
  `    const token = res.token || (res.session && res.session.token);`,
  `    if (token) {`,
  `        pm.environment.set("token", token);`,
  `        console.log("✅ Authenticated as ${persona}. Token saved to environment.");`,
  `    } else {`,
  `        console.warn("⚠️ Sign-in succeeded but no token found in response.");`,
  `    }`,
  `    pm.test("Status code is 200 OK", () => {`,
  `        pm.response.to.have.status(200);`,
  `    });`,
  `    pm.test("Response has user details", () => {`,
  `        pm.expect(res.user).to.be.an("object");`,
  `    });`,
  `}`
];

// Helper to create basic assertion test script
const makeStatusTestScript = (expectedStatus: number, testName: string, customLogic: string[] = []) => [
  `pm.test("${testName} - Status code is ${expectedStatus}", () => {`,
  `    pm.response.to.have.status(${expectedStatus});`,
  `});`,
  ...customLogic
];

export const collection = {
  info: {
    _postman_id: "7d9b23f1-7a2e-4b69-897d-419b4b9b2222",
    name: "Developer Assessment & Coding Platform API",
    description: "Complete Postman collection for Developer Assessment & Coding Platform backend. Covers Better Auth, Problem Bank, Assessment Builder, Candidate Invitations, Timed Attempt Engine, Manual Evaluation Queue, and Reporting.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  auth: {
    type: "bearer",
    bearer: [
      {
        key: "token",
        value: "{{token}}",
        type: "string"
      }
    ]
  },
  event: [
    {
      listen: "prerequest",
      script: {
        type: "text/javascript",
        exec: [
          "// Automatically inject Origin header to satisfy Better Auth CSRF validation",
          "const originUrl = pm.environment.get('baseUrl') || 'http://localhost:5000';",
          "if (!pm.request.headers.has('Origin')) {",
          "    pm.request.headers.add({",
          "        key: 'Origin',",
          "        value: originUrl",
          "    });",
          "}"
        ]
      }
    }
  ],
  item: [
    // =========================================================
    // 0. System & Health
    // =========================================================
    {
      name: "0. System & Documentation",
      item: [
        {
          name: "Healthcheck",
          request: {
            auth: { type: "noauth" },
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/v1/health",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "health"]
            },
            description: "Check server liveness and database connectivity."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeStatusTestScript(200, "Healthcheck"),
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Get OpenAPI 3.1 Specification JSON",
          request: {
            auth: { type: "noauth" },
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/docs/openapi.json",
              host: ["{{baseUrl}}"],
              path: ["api", "docs", "openapi.json"]
            },
            description: "Fetches the full code-first OpenAPI 3.1 specification containing all 89 routes."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeStatusTestScript(200, "OpenAPI Spec"),
                type: "text/javascript"
              }
            }
          ]
        }
      ]
    },

    // =========================================================
    // 1. Authentication (Better Auth)
    // =========================================================
    {
      name: "1. Authentication (Better Auth)",
      item: [
        {
          name: "Sign In as Recruiter (Alex Rivera)",
          request: {
            auth: { type: "noauth" },
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                email: "{{recruiterEmail}}",
                password: "{{defaultPassword}}"
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/auth/sign-in/email",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "sign-in", "email"]
            },
            description: "Sign in as Recruiter (recruiter@techcorp.dev). Sets {{token}} in environment."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeAuthTestScript("Recruiter (Alex Rivera)"),
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Sign In as Company Admin (Sarah Connor)",
          request: {
            auth: { type: "noauth" },
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                email: "{{companyAdminEmail}}",
                password: "{{defaultPassword}}"
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/auth/sign-in/email",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "sign-in", "email"]
            },
            description: "Sign in as Company Admin (admin@techcorp.dev). Sets {{token}} in environment."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeAuthTestScript("Company Admin (Sarah Connor)"),
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Sign In as Candidate Alice (Alice Chen)",
          request: {
            auth: { type: "noauth" },
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                email: "{{candidateAliceEmail}}",
                password: "{{defaultPassword}}"
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/auth/sign-in/email",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "sign-in", "email"]
            },
            description: "Sign in as Candidate Alice (alice@candidate.dev). Sets {{token}} in environment."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeAuthTestScript("Candidate Alice"),
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Sign In as Candidate Bob (Bob Miller)",
          request: {
            auth: { type: "noauth" },
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                email: "{{candidateBobEmail}}",
                password: "{{defaultPassword}}"
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/auth/sign-in/email",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "sign-in", "email"]
            },
            description: "Sign in as Candidate Bob (bob@candidate.dev). Sets {{token}} in environment."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeAuthTestScript("Candidate Bob"),
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Sign In as Platform Admin",
          request: {
            auth: { type: "noauth" },
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                email: "{{platformAdminEmail}}",
                password: "{{defaultPassword}}"
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/auth/sign-in/email",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "sign-in", "email"]
            },
            description: "Sign in as Platform Admin (admin@platform.dev). Sets {{token}} in environment."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeAuthTestScript("Platform Admin"),
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Sign Up (Register New User)",
          request: {
            auth: { type: "noauth" },
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                name: "New Candidate",
                email: "newcandidate." + Date.now() + "@test.dev",
                password: "{{defaultPassword}}"
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/auth/sign-up/email",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "sign-up", "email"]
            },
            description: "Registers a new user in the platform via Better Auth."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 200 || pm.response.code === 201) {`,
                  `    const res = pm.response.json();`,
                  `    const token = res.token || (res.session && res.session.token);`,
                  `    if (token) pm.environment.set("token", token);`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Get Current Session",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/auth/get-session",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "get-session"]
            },
            description: "Fetches active Better Auth user and session using the current Bearer token."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeStatusTestScript(200, "Get Current Session"),
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "List User Organizations",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/auth/organization/list",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "organization", "list"]
            },
            description: "Lists organizations for the currently authenticated user."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 200) {`,
                  `    const orgs = pm.response.json();`,
                  `    if (Array.isArray(orgs) && orgs.length > 0) {`,
                  `        pm.environment.set("organizationId", orgs[0].id);`,
                  `        console.log("Auto-detected organizationId:", orgs[0].id);`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Sign Out",
          request: {
            method: "POST",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/auth/sign-out",
              host: ["{{baseUrl}}"],
              path: ["api", "auth", "sign-out"]
            },
            description: "Terminates the current Better Auth session."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 200) {`,
                  `    pm.environment.set("token", "");`,
                  `    console.log("Logged out, token cleared.");`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        }
      ]
    },

    // =========================================================
    // 2. Problem Bank (/api/v1/problems)
    // =========================================================
    {
      name: "2. Problem Bank",
      item: [
        {
          name: "List Problems",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/problems?page=1&limit=10",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "problems"],
              query: [
                { key: "page", value: "1" },
                { key: "limit", value: "10" }
              ]
            },
            description: "List company problems with pagination. Requires Recruiter or Company Admin role."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 200) {`,
                  `    const res = pm.response.json();`,
                  `    if (res.data && res.data.length > 0) {`,
                  `        pm.environment.set("problemId", res.data[0].id);`,
                  `        console.log("Saved problemId:", res.data[0].id);`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Filter Problems by Type (CODING)",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/problems?type=CODING&page=1&limit=10",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "problems"],
              query: [
                { key: "type", value: "CODING" },
                { key: "page", value: "1" },
                { key: "limit", value: "10" }
              ]
            },
            description: "Filter problem bank by question type: MCQ_SINGLE, MCQ_MULTIPLE, WRITTEN, CODING."
          }
        },
        {
          name: "Get Problem by ID",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/problems/{{problemId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "problems", "{{problemId}}"]
            },
            description: "Get full details of a problem including evaluation rubric and test cases."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeStatusTestScript(200, "Get Problem by ID"),
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Create Problem (MCQ_SINGLE)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                title: "Postman Test: PostgreSQL Transaction Isolation",
                description: "Which transaction isolation level prevents dirty reads, non-repeatable reads, and phantom reads?",
                type: "MCQ_SINGLE",
                difficulty: "MEDIUM",
                defaultPoints: 10.0,
                tags: ["database", "postgresql", "sql"],
                mcqOptions: [
                  { text: "Read Uncommitted", isCorrect: false },
                  { text: "Read Committed", isCorrect: false },
                  { text: "Repeatable Read", isCorrect: false },
                  { text: "Serializable", isCorrect: true }
                ]
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/problems",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "problems"]
            },
            description: "Creates a single-choice MCQ problem in the problem bank."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 201) {`,
                  `    const res = pm.response.json();`,
                  `    if (res.data && res.data.id) {`,
                  `        pm.environment.set("problemId", res.data.id);`,
                  `        console.log("Created and saved new problemId:", res.data.id);`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Create Problem (CODING)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                title: "Postman Test: Reverse Linked List",
                description: "Given the head of a singly linked list, reverse the list, and return the reversed list.",
                type: "CODING",
                difficulty: "EASY",
                defaultPoints: 20.0,
                tags: ["algorithms", "linked-list"],
                codingDetails: {
                  allowedLanguages: ["typescript", "javascript", "python"],
                  starterCode: {
                    typescript: "function reverseList(head: ListNode | null): ListNode | null {\n  // Implementation here\n}",
                    python: "def reverseList(head: Optional[ListNode]) -> Optional[ListNode]:\n    pass"
                  },
                  sampleIo: [
                    {
                      input: "head = [1,2,3,4,5]",
                      output: "[5,4,3,2,1]",
                      explanation: "The list is inverted"
                    }
                  ],
                  constraints: ["0 <= Node.val <= 5000"]
                },
                evaluationRubric: "Award 10 points for O(n) iterative approach, 5 points for handling empty/single node, 5 points for code cleanliness."
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/problems",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "problems"]
            },
            description: "Creates a coding challenge problem with boilerplate and evaluation rubric."
          }
        },
        {
          name: "Update Problem",
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                title: "Updated Problem Title via Postman",
                difficulty: "HARD",
                defaultPoints: 15.0
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/problems/{{problemId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "problems", "{{problemId}}"]
            },
            description: "Update problem details. Fails if problem is locked in an active assessment."
          }
        },
        {
          name: "Delete Problem",
          request: {
            method: "DELETE",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/problems/{{problemId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "problems", "{{problemId}}"]
            },
            description: "Deletes a problem from the bank."
          }
        }
      ]
    },

    // =========================================================
    // 3. Assessment Builder (/api/v1/assessments)
    // =========================================================
    {
      name: "3. Assessment Builder",
      item: [
        {
          name: "List Assessments",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/assessments?page=1&limit=10",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "assessments"],
              query: [
                { key: "page", value: "1" },
                { key: "limit", value: "10" }
              ]
            },
            description: "List organization assessments with status and candidate count metrics."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 200) {`,
                  `    const res = pm.response.json();`,
                  `    if (res.data && res.data.length > 0) {`,
                  `        pm.environment.set("assessmentId", res.data[0].id);`,
                  `        console.log("Saved assessmentId:", res.data[0].id);`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Create Assessment Draft",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                title: "Postman Automated Full Stack Assessment",
                description: "Assessment created via Postman testing suite.",
                instructions: "Complete all questions within 60 minutes. Coding solutions are evaluated by our engineering team.",
                durationMinutes: 60,
                passingScore: 70.0
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/assessments",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "assessments"]
            },
            description: "Creates a new assessment draft. Status defaults to DRAFT."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 201) {`,
                  `    const res = pm.response.json();`,
                  `    if (res.data && res.data.id) {`,
                  `        pm.environment.set("assessmentId", res.data.id);`,
                  `        console.log("Created and saved assessmentId:", res.data.id);`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "Get Assessment by ID",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/assessments/{{assessmentId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "assessments", "{{assessmentId}}"]
            },
            description: "Get detailed assessment with full question set, rubrics, and answer keys."
          }
        },
        {
          name: "Add Problem to Assessment",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                problemId: "{{problemId}}",
                points: 25.0,
                orderIndex: 1
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/assessments/{{assessmentId}}/problems",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "assessments", "{{assessmentId}}", "problems"]
            },
            description: "Attach a problem from the problem bank to the assessment draft."
          }
        },
        {
          name: "Publish Assessment (Transition Status)",
          request: {
            method: "PATCH",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                status: "PUBLISHED"
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/assessments/{{assessmentId}}/status",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "assessments", "{{assessmentId}}", "status"]
            },
            description: "Transition assessment status: DRAFT -> PUBLISHED -> ACTIVE -> CLOSED -> ARCHIVED."
          }
        },
        {
          name: "Remove Problem from Assessment",
          request: {
            method: "DELETE",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/assessments/{{assessmentId}}/problems/{{problemId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "assessments", "{{assessmentId}}", "problems", "{{problemId}}"]
            },
            description: "Removes a problem from an assessment draft."
          }
        }
      ]
    },

    // =========================================================
    // 4. Candidate Invitations (/api/v1/assessments/:id/invitations & /api/v1/invitations)
    // =========================================================
    {
      name: "4. Candidate Invitations",
      item: [
        {
          name: "Dispatch Candidate Invitations (Single / Bulk)",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                invitations: [
                  {
                    candidateEmail: "{{candidateBobEmail}}",
                    candidateName: "Bob Miller"
                  }
                ],
                defaultExpiresInDays: 7
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/assessments/{{assessmentId}}/invitations",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "assessments", "{{assessmentId}}", "invitations"]
            },
            description: "Dispatches invitations to candidates. Auto-saves {{invitationToken}} to environment."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 201) {`,
                  `    const res = pm.response.json();`,
                  `    if (res.data && res.data.invitations && res.data.invitations.length > 0) {`,
                  `        const token = res.data.invitations[0].inviteToken;`,
                  `        pm.environment.set("invitationToken", token);`,
                  `        console.log("Saved new invitationToken:", token);`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "List Sent Invitations for Assessment",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/assessments/{{assessmentId}}/invitations?page=1&limit=20",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "assessments", "{{assessmentId}}", "invitations"],
              query: [
                { key: "page", value: "1" },
                { key: "limit", value: "20" }
              ]
            },
            description: "Lists all candidate invitations sent for this assessment."
          }
        },
        {
          name: "Verify Invitation Token (Candidate Endpoint)",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/v1/invitations/verify/{{invitationToken}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "invitations", "verify", "{{invitationToken}}"]
            },
            description: "Candidate verifies their invite token. Logged-in session email must match the invitation recipient!"
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeStatusTestScript(200, "Verify Token"),
                type: "text/javascript"
              }
            }
          ]
        }
      ]
    },

    // =========================================================
    // 5. Candidate Attempt Flow (/api/v1/attempts)
    // =========================================================
    {
      name: "5. Candidate Attempt Flow",
      item: [
        {
          name: "1. Start or Resume Attempt Session",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                inviteToken: "{{invitationToken}}"
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/attempts/start",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "attempts", "start"]
            },
            description: "Validates inviteToken against logged-in candidate, initializes server countdown timer, and returns sanitized questions. Auto-saves {{attemptId}}."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 200 || pm.response.code === 201) {`,
                  `    const res = pm.response.json();`,
                  `    if (res.data && res.data.id) {`,
                  `        pm.environment.set("attemptId", res.data.id);`,
                  `        console.log("Saved attemptId:", res.data.id);`,
                  `    }`,
                  `    if (res.data && res.data.problems && res.data.problems.length > 0) {`,
                  `        pm.environment.set("problemId", res.data.problems[0].problemId);`,
                  `        console.log("Saved first problemId from attempt:", res.data.problems[0].problemId);`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "2. Get Current Attempt Session & Drafts",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/v1/attempts/{{attemptId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "attempts", "{{attemptId}}"]
            },
            description: "Fetches active attempt state, remaining countdown seconds, and previously saved answer drafts."
          }
        },
        {
          name: "3. Autosave Answer Draft (MCQ)",
          request: {
            method: "PUT",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                problemId: "{{problemId}}",
                selectedOptions: ["a8098c1a-f86e-11da-bd1a-00112444be1e"]
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/attempts/{{attemptId}}/answers",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "attempts", "{{attemptId}}", "answers"]
            },
            description: "Autosaves an answer draft for an MCQ question during the exam."
          }
        },
        {
          name: "3. Autosave Answer Draft (Coding / Written)",
          request: {
            method: "PUT",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                problemId: "{{problemId}}",
                submittedCode: "function lruCache() {\n  // Candidate implementation\n  return true;\n}",
                selectedLanguage: "typescript",
                writtenAnswer: "My architectural trade-offs: Used doubly linked list with hash table for O(1) operations."
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/attempts/{{attemptId}}/answers",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "attempts", "{{attemptId}}", "answers"]
            },
            description: "Autosaves coding or essay answers."
          }
        },
        {
          name: "4. Final Submit Assessment",
          request: {
            method: "POST",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/v1/attempts/{{attemptId}}/submit",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "attempts", "{{attemptId}}", "submit"]
            },
            description: "Final submission. Locks answers, performs immediate MCQ auto-grading, and routes subjective problems to the Evaluation Queue."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: makeStatusTestScript(200, "Submit Attempt"),
                type: "text/javascript"
              }
            }
          ]
        }
      ]
    },

    // =========================================================
    // 6. Evaluation Queue & Review (/api/v1/evaluations)
    // =========================================================
    {
      name: "6. Evaluation Queue & Scoring",
      item: [
        {
          name: "1. View Evaluation Queue",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/evaluations/queue?status=PENDING&page=1&limit=20",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "evaluations", "queue"],
              query: [
                { key: "status", value: "PENDING" },
                { key: "page", value: "1" },
                { key: "limit", value: "20" }
              ]
            },
            description: "Lists submissions pending human review. Auto-saves first {{reviewId}}."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 200) {`,
                  `    const res = pm.response.json();`,
                  `    if (res.data && res.data.length > 0 && res.data[0].reviewId) {`,
                  `        pm.environment.set("reviewId", res.data[0].reviewId);`,
                  `        console.log("Saved reviewId from queue:", res.data[0].reviewId);`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "2. Get Evaluation Review Details & Rubric",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/evaluations/{{reviewId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "evaluations", "{{reviewId}}"]
            },
            description: "Get candidate answers, rubrics, and existing scores. Auto-saves first subjective {{submissionAnswerId}}."
          },
          event: [
            {
              listen: "test",
              script: {
                exec: [
                  `if (pm.response.code === 200) {`,
                  `    const res = pm.response.json();`,
                  `    if (res.data && res.data.questions) {`,
                  `        const subjective = res.data.questions.find(q => q.type === 'CODING' || q.type === 'WRITTEN');`,
                  `        if (subjective && subjective.submissionAnswerId) {`,
                  `            pm.environment.set("submissionAnswerId", subjective.submissionAnswerId);`,
                  `            console.log("Saved submissionAnswerId for grading:", subjective.submissionAnswerId);`,
                  `        }`,
                  `    }`,
                  `}`
                ],
                type: "text/javascript"
              }
            }
          ]
        },
        {
          name: "3. Claim Review",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({ unclaim: false }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/evaluations/{{reviewId}}/claim",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "evaluations", "{{reviewId}}", "claim"]
            },
            description: "Assigns the review to the current recruiter/admin, preventing concurrent review collisions."
          }
        },
        {
          name: "4. Score Individual Question with Rubric",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                submissionAnswerId: "{{submissionAnswerId}}",
                awardedPoints: 18.5,
                feedback: "Good algorithmic analysis, optimal doubly-linked-list implementation. Handled edge cases cleanly."
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/evaluations/{{reviewId}}/score",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "evaluations", "{{reviewId}}", "score"]
            },
            description: "Awards marks and constructive feedback against rubric."
          }
        },
        {
          name: "5. Finalize Evaluation",
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "x-organization-id", value: "{{organizationId}}" }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify({
                overallFeedback: "Strong overall performance in systems design and coding."
              }, null, 2),
              options: { raw: { language: "json" } }
            },
            url: {
              raw: "{{baseUrl}}/api/v1/evaluations/{{reviewId}}/finalize",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "evaluations", "{{reviewId}}", "finalize"]
            },
            description: "Finalizes evaluation review, aggregates auto and manual points, computes percentage & pass/fail status, and marks attempt as COMPLETED."
          }
        }
      ]
    },

    // =========================================================
    // 7. Reports & Analytics (/api/v1/reports)
    // =========================================================
    {
      name: "7. Reports & Analytics",
      item: [
        {
          name: "Assessment Cohort Summary",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/reports/assessments/{{assessmentId}}/summary",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "reports", "assessments", "{{assessmentId}}", "summary"]
            },
            description: "Aggregated cohort statistics: pass rates, average/median scores, distribution buckets, and problem-by-problem accuracy."
          }
        },
        {
          name: "Candidate Scorecard (Recruiter / Admin View)",
          request: {
            method: "GET",
            header: [{ key: "x-organization-id", value: "{{organizationId}}" }],
            url: {
              raw: "{{baseUrl}}/api/v1/reports/attempts/{{attemptId}}",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "reports", "attempts", "{{attemptId}}"]
            },
            description: "Detailed recruiter scorecard showing breakdown per question, reviewer marks, rubrics, and feedback."
          }
        },
        {
          name: "Candidate Self-Service Scorecard (My Results)",
          request: {
            method: "GET",
            header: [],
            url: {
              raw: "{{baseUrl}}/api/v1/reports/candidate/my-results",
              host: ["{{baseUrl}}"],
              path: ["api", "v1", "reports", "candidate", "my-results"]
            },
            description: "Candidate view of all completed attempts and scores (no organization header required)."
          }
        }
      ]
    }
  ]
};

const outputPath = path.resolve("postman/dev-assessment-platform.postman_collection.json");
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2), "utf8");
console.log("Successfully generated:", outputPath);

