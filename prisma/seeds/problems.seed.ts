import crypto from "node:crypto";
import { prisma } from "../../src/lib/prisma.js";
import { seedUsers } from "./users.seed.js";
import { QuestionType, Difficulty } from "../../src/generated/client/client.js";

type UserSummary = Awaited<ReturnType<typeof seedUsers>>;

interface SeedProblemItem {
  title: string;
  description: string;
  type: QuestionType;
  difficulty: Difficulty;
  defaultPoints: number;
  tags: string[];
  mcqOptions?: Array<{ id: string; text: string; isCorrect: boolean }>;
  codingDetails?: {
    starterCode?: Record<string, string>;
    allowedLanguages: string[];
    sampleIo: Array<{ input: string; output: string; explanation?: string }>;
    constraints?: string[];
  };
  evaluationRubric?: string;
}

const DEMO_PROBLEMS: SeedProblemItem[] = [
  // 1. MCQ_SINGLE: JavaScript Event Loop
  {
    title: "JavaScript Event Loop Execution Order",
    description:
      "Consider a scenario with `Promise.resolve().then(...)`, `setTimeout(..., 0)`, and synchronous `console.log(...)`. Which of the following accurately describes the order of execution in the V8 engine?",
    type: "MCQ_SINGLE",
    difficulty: "MEDIUM",
    defaultPoints: 10.0,
    tags: ["javascript", "event-loop", "async", "v8"],
    mcqOptions: [
      {
        id: crypto.randomUUID(),
        text: "Synchronous code executes first, then the microtask queue (Promises), and finally the macrotask queue (setTimeout).",
        isCorrect: true,
      },
      {
        id: crypto.randomUUID(),
        text: "The macrotask queue executes before the microtask queue because setTimeout was registered earlier.",
        isCorrect: false,
      },
      {
        id: crypto.randomUUID(),
        text: "Microtasks and macrotasks are interleaved and executed concurrently on worker threads.",
        isCorrect: false,
      },
      {
        id: crypto.randomUUID(),
        text: "Promises run synchronously on the main thread blocking subsequent code until resolved.",
        isCorrect: false,
      },
    ],
  },
  // 2. MCQ_SINGLE: SQL Indexing
  {
    title: "SQL Indexing: B-Tree vs Hash Index",
    description:
      "When optimizing queries with range conditions (e.g. `WHERE salary BETWEEN 50000 AND 80000`), which index type should be used in PostgreSQL and why?",
    type: "MCQ_SINGLE",
    difficulty: "EASY",
    defaultPoints: 5.0,
    tags: ["sql", "postgresql", "indexing", "performance"],
    mcqOptions: [
      {
        id: crypto.randomUUID(),
        text: "B-Tree index, because B-Trees maintain sorted key order and support range scan operations efficiently.",
        isCorrect: true,
      },
      {
        id: crypto.randomUUID(),
        text: "Hash index, because hash lookups are strictly O(1) for both equality and range scans.",
        isCorrect: false,
      },
      {
        id: crypto.randomUUID(),
        text: "GIN index, because range predicates always require inverted index mapping.",
        isCorrect: false,
      },
      {
        id: crypto.randomUUID(),
        text: "BRIN index is mandatory for any query involving numeric values under 100,000.",
        isCorrect: false,
      },
    ],
  },
  // 3. MCQ_MULTIPLE: HTTP Idempotent Methods
  {
    title: "HTTP Idempotency in RESTful APIs",
    description:
      "An HTTP method is idempotent if the intended effect on the server of multiple identical requests is the same as for a single request. Which of the following HTTP methods are idempotent according to RFC 9110?",
    type: "MCQ_MULTIPLE",
    difficulty: "MEDIUM",
    defaultPoints: 10.0,
    tags: ["http", "rest", "api-design", "rfc9110"],
    mcqOptions: [
      {
        id: crypto.randomUUID(),
        text: "GET",
        isCorrect: true,
      },
      {
        id: crypto.randomUUID(),
        text: "PUT",
        isCorrect: true,
      },
      {
        id: crypto.randomUUID(),
        text: "DELETE",
        isCorrect: true,
      },
      {
        id: crypto.randomUUID(),
        text: "POST",
        isCorrect: false,
      },
    ],
  },
  // 4. MCQ_MULTIPLE: React Hook Rules
  {
    title: "React Hooks Rules and Guarantees",
    description:
      "To ensure that stateful logic is preserved consistently across component renders, which of the following rules MUST be followed when calling React Hooks?",
    type: "MCQ_MULTIPLE",
    difficulty: "EASY",
    defaultPoints: 5.0,
    tags: ["react", "frontend", "hooks"],
    mcqOptions: [
      {
        id: crypto.randomUUID(),
        text: "Only call hooks at the top level of function components, never inside loops, conditions, or nested functions.",
        isCorrect: true,
      },
      {
        id: crypto.randomUUID(),
        text: "Only call hooks from React function components or custom hooks.",
        isCorrect: true,
      },
      {
        id: crypto.randomUUID(),
        text: "Hooks can be called inside class component lifecycle methods like componentDidMount.",
        isCorrect: false,
      },
      {
        id: crypto.randomUUID(),
        text: "Hooks must always return an array with exactly two elements.",
        isCorrect: false,
      },
    ],
  },
  // 5. WRITTEN: Database Sharding vs Read Replicas
  {
    title: "Database Scaling: Read Replicas vs Horizontal Sharding",
    description:
      "You are designing the data layer for an e-commerce platform anticipating a 20x traffic increase during an annual sale. Explain the architectural trade-offs between deploying Read Replicas versus implementing Horizontal Database Sharding. Address write scaling, cross-partition joins, replication lag, and operational complexity.",
    type: "WRITTEN",
    difficulty: "HARD",
    defaultPoints: 20.0,
    tags: ["system-design", "architecture", "database", "scaling"],
    evaluationRubric:
      "Award up to 6 points for contrasting read scaling (replicas) vs write scaling (sharding). Award 5 points for explaining replication lag and stale reads. Award 5 points for cross-shard query complexity and rebalancing. Award 4 points for operational/failover complexity.",
  },
  // 6. WRITTEN: Distributed Caching Strategy
  {
    title: "Distributed Caching: Patterns & Cache Invalidation",
    description:
      "Compare the Cache-Aside (Lazy Loading) and Write-Through caching patterns in a distributed microservices environment. How would you mitigate the 'Cache Stampede' (Thundering Herd) problem when a hot cache key expires?",
    type: "WRITTEN",
    difficulty: "MEDIUM",
    defaultPoints: 15.0,
    tags: ["caching", "redis", "system-design", "performance"],
    evaluationRubric:
      "Award 5 points for accurately describing Cache-Aside vs Write-Through trade-offs. Award 5 points for explaining write latency and consistency. Award 5 points for concrete cache stampede mitigations (distributed locks/mutex, probabilistic early expiration, background refresh).",
  },
  // 7. CODING: LRU Cache
  {
    title: "Design and Implement an LRU Cache",
    description:
      "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.\n\nImplement the `LRUCache` class:\n- `LRUCache(int capacity)`: Initialize the LRU cache with positive size capacity.\n- `int get(int key)`: Return the value of the key if the key exists, otherwise return -1.\n- `void put(int key, int value)`: Update the value of the key if the key exists. Otherwise, add the key-value pair to the cache. If the number of keys exceeds the capacity from this operation, evict the least recently used key.\n\nThe functions `get` and `put` must each run in O(1) average time complexity.",
    type: "CODING",
    difficulty: "HARD",
    defaultPoints: 25.0,
    tags: ["data-structures", "hash-table", "doubly-linked-list", "algorithms"],
    codingDetails: {
      allowedLanguages: ["typescript", "javascript", "python"],
      starterCode: {
        typescript:
          "class LRUCache {\n  constructor(capacity: number) {\n    // Initialize your data structure here\n  }\n\n  get(key: number): number {\n    return -1;\n  }\n\n  put(key: number, value: number): void {\n    // Insert or update key\n  }\n}",
        python:
          "class LRUCache:\n    def __init__(self, capacity: int):\n        pass\n\n    def get(self, key: int) -> int:\n        return -1\n\n    def put(self, key: int, value: int) -> None:\n        pass",
      },
      sampleIo: [
        {
          input: "capacity = 2; put(1, 1); put(2, 2); get(1); put(3, 3); get(2);",
          output: "get(1) => 1; get(2) => -1",
          explanation: "Key 2 was evicted when key 3 was inserted because key 2 was the least recently used.",
        },
        {
          input: "capacity = 1; put(2, 1); get(2); put(3, 2); get(2); get(3);",
          output: "get(2) => 1; get(2) => -1; get(3) => 2",
          explanation: "Eviction occurs immediately on the second put.",
        },
      ],
      constraints: [
        "1 <= capacity <= 3000",
        "0 <= key <= 10^4",
        "0 <= value <= 10^5",
        "At most 2 * 10^5 calls will be made to get and put",
      ],
    },
    evaluationRubric:
      "Award 10 points for O(1) time complexity using Doubly Linked List + HashMap. Award 5 points for clean node eviction and insertion logic. Award 5 points for properly updating recency on get calls. Award 5 points for handling edge cases (capacity 1, repeated key overwrite).",
  },
  // 8. CODING: Two Sum Sorted
  {
    title: "Two Sum II - Input Array Is Sorted",
    description:
      "Given a 1-indexed array of integers `numbers` that is already sorted in non-decreasing order, find two numbers such that they add up to a specific `target` number.\n\nReturn the indices of the two numbers, `[index1, index2]`, added by one as an integer array `[index1, index2]` of length 2.\n\nThe tests are generated such that there is exactly one solution. You may not use the same element twice.\n\nYour solution must use only O(1) additional memory.",
    type: "CODING",
    difficulty: "EASY",
    defaultPoints: 15.0,
    tags: ["two-pointers", "arrays", "binary-search", "algorithms"],
    codingDetails: {
      allowedLanguages: ["typescript", "javascript", "python"],
      starterCode: {
        typescript:
          "function twoSum(numbers: number[], target: number): number[] {\n  // Return 1-indexed [index1, index2]\n  return [];\n}",
        python:
          "def twoSum(numbers: list[int], target: int) -> list[int]:\n    # Return 1-indexed [index1, index2]\n    return []",
      },
      sampleIo: [
        {
          input: "numbers = [2, 7, 11, 15], target = 9",
          output: "[1, 2]",
          explanation: "The sum of 2 and 7 is 9. Therefore, index1 = 1, index2 = 2. We return [1, 2].",
        },
        {
          input: "numbers = [2, 3, 4], target = 6",
          output: "[1, 3]",
          explanation: "The sum of 2 and 4 is 6. Therefore index1 = 1, index2 = 3. We return [1, 3].",
        },
      ],
      constraints: [
        "2 <= numbers.length <= 3 * 10^4",
        "-1000 <= numbers[i] <= 1000",
        "numbers is sorted in non-decreasing order",
        "-1000 <= target <= 1000",
        "The tests are generated such that there is exactly one solution.",
      ],
    },
    evaluationRubric:
      "Award 10 points for optimal O(N) two-pointer implementation. Award 5 points for strict O(1) space complexity without allocating extra arrays or hash maps.",
  },
];

/**
 * Idempotently seed problem bank questions for the demo organization
 */
export async function seedProblems(userSummary: UserSummary) {
  const organizationId = userSummary.organization.id;
  const creatorId = userSummary.users.recruiter.id;

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of DEMO_PROBLEMS) {
    const existing = await prisma.problem.findFirst({
      where: {
        organizationId,
        title: item.title,
      },
    });

    if (existing) {
      await prisma.problem.update({
        where: { id: existing.id },
        data: {
          description: item.description,
          type: item.type,
          difficulty: item.difficulty,
          defaultPoints: item.defaultPoints,
          tags: item.tags,
          mcqOptions: item.mcqOptions ? (item.mcqOptions as any) : undefined,
          codingDetails: item.codingDetails ? (item.codingDetails as any) : undefined,
          evaluationRubric: item.evaluationRubric,
        },
      });
      updatedCount++;
    } else {
      await prisma.problem.create({
        data: {
          id: crypto.randomUUID(),
          organizationId,
          creatorId,
          title: item.title,
          description: item.description,
          type: item.type,
          difficulty: item.difficulty,
          defaultPoints: item.defaultPoints,
          tags: item.tags,
          mcqOptions: item.mcqOptions ? (item.mcqOptions as any) : undefined,
          codingDetails: item.codingDetails ? (item.codingDetails as any) : undefined,
          evaluationRubric: item.evaluationRubric,
        },
      });
      createdCount++;
    }
  }

  console.log(
    `  📝 Problems: ${createdCount} created, ${updatedCount} updated (total: ${DEMO_PROBLEMS.length}) for Org: ${userSummary.organization.name}`
  );

  return {
    totalProblems: DEMO_PROBLEMS.length,
    createdCount,
    updatedCount,
  };
}
