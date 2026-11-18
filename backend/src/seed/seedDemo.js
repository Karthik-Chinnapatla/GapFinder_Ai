const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const Document = require('../models/Document');
const DocumentChunk = require('../models/DocumentChunk');
const Assessment = require('../models/Assessment');
const Question = require('../models/Question');
const StudentAnswer = require('../models/StudentAnswer');
const TopicPerformance = require('../models/TopicPerformance');
const RevisionTask = require('../models/RevisionTask');
const ChatHistory = require('../models/ChatHistory');
const { UPLOAD_DIR, IS_SERVERLESS } = require('../middleware/upload');
const { indexDocumentInAI } = require('../services/aiClient');
const { recalculateTopicDiagnosis } = require('../services/diagnosisEngine');
const { syncRevisionPlanForSubject } = require('../services/revisionEngine');
const { SAMPLE_FILES } = require('./sampleContent');

async function indexFallbackChunks(doc, chapterTitle, rawContent) {
  // Used only if Python AI service isn't started yet during an offline seed script run
  const paragraphs = rawContent
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 25);

  let currentSection = chapterTitle;
  const chunkDocs = [];
  let idx = 0;

  for (const para of paragraphs) {
    if (para.startsWith('#')) {
      currentSection = para.replace(/^#+\s*/, '').trim();
      continue;
    }
    chunkDocs.push({
      userId: doc.userId,
      documentId: doc._id,
      subjectId: doc.subjectId,
      chapterId: doc.chapterId,
      topicIds: [],
      chunkIndex: idx++,
      pageNumber: null,
      sectionTitle: currentSection,
      documentName: doc.originalName,
      chapterTitle,
      content: para,
      tokenCount: para.split(/\s+/).length,
      embedding: [],
      embeddingModel: 'pending-reindex',
      isDemo: true,
    });
  }

  if (chunkDocs.length > 0) {
    await DocumentChunk.insertMany(chunkDocs);
  }
  doc.processingStatus = 'indexed';
  doc.chunkCount = chunkDocs.length;
  doc.extractedCharCount = rawContent.length;
  doc.previewText = rawContent.slice(0, 450);
  await doc.save();
}

async function ensureDemoAccountSeeded() {
  const demoEmail = (process.env.DEMO_STUDENT_EMAIL || 'demo.student@gapfinder.ai').toLowerCase().trim();
  const demoPassword = process.env.DEMO_STUDENT_PASSWORD || 'GapFinderDemo2026!';

  let demoUser = await User.findOne({ email: demoEmail });
  if (demoUser) {
    // Check if demo user already has subjects & indexed chunks
    const subjCount = await Subject.countDocuments({ userId: demoUser._id });
    if (subjCount > 0) {
      // If any demo chunks were created offline without embeddings, re-index via Python AI if available
      const missingEmbDocs = await DocumentChunk.distinct('documentId', {
        userId: demoUser._id,
        embeddingModel: 'pending-reindex',
      });
      if (missingEmbDocs.length > 0) {
        const docs = await Document.find({ _id: { $in: missingEmbDocs } }).populate('chapterId', 'title');
        for (const d of docs) {
          try {
            await indexDocumentInAI({
              documentId: d._id.toString(),
              userId: demoUser._id.toString(),
              subjectId: d.subjectId.toString(),
              chapterId: d.chapterId ? d.chapterId._id.toString() : null,
              chapterTitle: d.chapterId ? d.chapterId.title : '',
              documentName: d.originalName,
              filePath: d.filePath,
              fileType: d.fileType,
              isDemo: true,
            });
          } catch (_e) {
            // AI service not running yet; keep existing chunks
          }
        }
      }
      return demoUser;
    }
  } else {
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    demoUser = await User.create({
      name: 'Aarav Sharma (Demo)',
      email: demoEmail,
      passwordHash,
      role: 'student',
      isDemo: true,
      thresholds: {
        criticalMax: 39,
        needsImprovementMax: 59,
        developingMax: 79,
        minAttemptsForDiagnosis: 3,
      },
      lastLoginAt: new Date(),
    });
  }

  // 1. Create Subject: Data Structures
  const subject = await Subject.create({
    userId: demoUser._id,
    name: 'Data Structures',
    code: 'CS201',
    description:
      'Core undergraduate Data Structures syllabus covering Arrays, Linked Lists, Stacks, Queues, Trees, Graphs, and Sorting Algorithms.',
    color: '#4F46E5',
    isDemo: true,
  });

  demoUser.currentSubjectId = subject._id;
  await demoUser.save();

  // 2. Create 7 Chapters + Topics
  const syllabusDef = [
    {
      title: 'Arrays',
      description: 'Contiguous memory layout, index arithmetic, dynamic resizing, and binary search.',
      topicName: 'Arrays & Contiguous Memory',
      topicDesc: 'Random access O(1), insertion/deletion shifting O(n), cache locality, and binary search on sorted arrays.',
      keyConcepts: ['Contiguous Memory', 'O(1) Random Access', 'Shifting Cost', 'Binary Search'],
    },
    {
      title: 'Linked Lists',
      description: 'Singly and doubly linked nodes, pointer manipulation, and cycle detection.',
      topicName: 'Linked Lists & Pointer Operations',
      topicDesc: 'Non-contiguous nodes, O(1) head insertion, O(n) traversal, doubly linked lists, and Floyd cycle detection.',
      keyConcepts: ['Node Pointers', 'Head Insertion', 'Doubly Linked List', 'Floyd Cycle Detection'],
    },
    {
      title: 'Stacks',
      description: 'LIFO abstract data type, call stacks, expression parsing, and backtracking.',
      topicName: 'Stacks (LIFO & Applications)',
      topicDesc: 'Push/pop/peek O(1) operations, balanced brackets, postfix evaluation, and recursion call frames.',
      keyConcepts: ['LIFO', 'Push/Pop O(1)', 'Call Stack', 'Expression Evaluation'],
    },
    {
      title: 'Queues',
      description: 'FIFO queues, circular buffer wrap-around, and scheduling applications.',
      topicName: 'Queues & Circular Queues',
      topicDesc: 'FIFO enqueue/dequeue O(1), modulo wrap-around, overflow/underflow checks, and BFS queues.',
      keyConcepts: ['FIFO', 'Circular Queue Modulo', 'Overflow Condition', 'BFS Queue'],
    },
    {
      title: 'Trees',
      description: 'Binary trees, BST global ordering invariants, traversals, and AVL balancing.',
      topicName: 'Binary Trees & BSTs',
      topicDesc: 'Distinguishing general Binary Trees vs BST invariants, in-order/pre-order/post-order traversals, skewed trees, and AVL balance factors.',
      keyConcepts: ['Binary Tree vs BST', 'Global BST Invariant', 'In-order Sorted Output', 'AVL Rotations'],
    },
    {
      title: 'Graphs',
      description: 'Graph representations (adjacency matrix vs list), BFS, DFS, Dijkstra, and MST.',
      topicName: 'Graphs & Traversals (BFS/DFS)',
      topicDesc: 'Adjacency list O(V+E) vs matrix O(V^2), BFS shortest paths in unweighted graphs, DFS cycle detection, and Dijkstra limitations.',
      keyConcepts: ['Adjacency List vs Matrix', 'BFS Shortest Path', 'DFS Topological Sort', 'Dijkstra Non-negative Weights'],
    },
    {
      title: 'Sorting Algorithms',
      description: 'Comparison-based sorting complexities, in-place behavior, and stability.',
      topicName: 'Sorting Algorithms & Stability',
      topicDesc: 'Merge Sort, Quick Sort pivot worst-case, Heap Sort O(1) space, and stable vs unstable sorting.',
      keyConcepts: ['Merge Sort O(n log n)', 'Quick Sort Worst-Case', 'Stability', 'In-place Space'],
    },
  ];

  const chaptersByTitle = new Map();
  const topicsByChapterTitle = new Map();

  for (let i = 0; i < syllabusDef.length; i++) {
    const item = syllabusDef[i];
    const ch = await Chapter.create({
      userId: demoUser._id,
      subjectId: subject._id,
      title: item.title,
      orderIndex: i + 1,
      description: item.description,
      isDemo: true,
    });
    const topic = await Topic.create({
      userId: demoUser._id,
      subjectId: subject._id,
      chapterId: ch._id,
      name: item.topicName,
      description: item.topicDesc,
      keyConcepts: item.keyConcepts,
      status: 'insufficient_data',
      masteryScore: null,
      isDemo: true,
    });
    chaptersByTitle.set(item.title, ch);
    topicsByChapterTitle.set(item.title, topic);
  }

  // 3. Index sample study files through RAG (in-memory Base64 on serverless, disk locally)
  const docsByChapterTitle = new Map();
  for (const sf of SAMPLE_FILES) {
    const ch = chaptersByTitle.get(sf.chapterTitle);
    const storedName = `demo_${sf.filename}`;
    const fullPath = IS_SERVERLESS ? `memory://${storedName}` : path.join(UPLOAD_DIR, storedName);
    if (!IS_SERVERLESS) {
      fs.writeFileSync(fullPath, sf.content, 'utf-8');
    }
    const fileContentBase64 = Buffer.from(sf.content, 'utf-8').toString('base64');

    const doc = await Document.create({
      userId: demoUser._id,
      subjectId: subject._id,
      chapterId: ch ? ch._id : null,
      originalName: sf.filename,
      storedName,
      filePath: fullPath,
      mimeType: 'text/plain',
      fileType: 'txt',
      fileSize: Buffer.byteLength(sf.content, 'utf-8'),
      docCategory: sf.docCategory,
      processingStatus: 'uploaded',
      isDemo: true,
    });

    try {
      await indexDocumentInAI({
        documentId: doc._id.toString(),
        userId: demoUser._id.toString(),
        subjectId: subject._id.toString(),
        chapterId: ch ? ch._id.toString() : null,
        chapterTitle: sf.chapterTitle,
        documentName: doc.originalName,
        filePath: fullPath,
        fileContentBase64,
        fileType: 'txt',
        isDemo: true,
      });
    } catch (_err) {
      await indexFallbackChunks(doc, sf.chapterTitle, sf.content);
    }

    const refreshedDoc = await Document.findById(doc._id);
    docsByChapterTitle.set(sf.chapterTitle, refreshedDoc);
  }

  // Helper to seed realistic chronological assessments so Progress & Diagnosis are 100% real DB records
  const now = Date.now();
  const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000);

  async function seedHistoricalAssessment({ title, daysBack, difficulty, items }) {
    const topicIds = Array.from(new Set(items.map((it) => topicsByChapterTitle.get(it.ch)._id)));
    const chapterIds = Array.from(new Set(items.map((it) => chaptersByTitle.get(it.ch)._id)));
    const completedAt = daysAgo(daysBack);

    const correctCount = items.filter((it) => it.correct).length;
    const scorePercentage = Math.round((correctCount / items.length) * 100);

    const assessment = await Assessment.create({
      userId: demoUser._id,
      subjectId: subject._id,
      chapterIds,
      topicIds,
      title,
      difficulty,
      questionTypes: ['mcq', 'true_false', 'conceptual'],
      questionCount: items.length,
      totalQuestions: items.length,
      status: 'completed',
      scorePercentage,
      correctCount,
      startedAt: new Date(completedAt.getTime() - 12 * 60 * 1000),
      completedAt,
      timeSpentSeconds: 640,
      diagnosticSummary: {
        weakTopicNames: Array.from(new Set(items.filter((i) => !i.correct).map((i) => topicsByChapterTitle.get(i.ch).name))),
        strongTopicNames: Array.from(new Set(items.filter((i) => i.correct).map((i) => topicsByChapterTitle.get(i.ch).name))),
        keyMisconceptions: Array.from(new Set(items.filter((i) => !i.correct && i.misconception).map((i) => i.misconception))),
        summaryText: `Completed with ${scorePercentage}% (${correctCount}/${items.length}). Topic mastery scores and revision priorities updated.`,
      },
      isDemo: true,
      createdAt: completedAt,
    });

    const affectedTopics = new Set();
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const topic = topicsByChapterTitle.get(it.ch);
      const chapter = chaptersByTitle.get(it.ch);
      const doc = docsByChapterTitle.get(it.ch) || docsByChapterTitle.get('Stacks');
      affectedTopics.add(topic._id.toString());

      const q = await Question.create({
        userId: demoUser._id,
        assessmentId: assessment._id,
        subjectId: subject._id,
        chapterId: chapter._id,
        topicId: topic._id,
        topicName: topic.name,
        questionIndex: idx + 1,
        questionType: it.qType || 'mcq',
        difficulty: it.qDiff || difficulty,
        prompt: it.prompt,
        options: it.options || ['True', 'False'],
        correctAnswer: it.correctAnswer,
        expectedKeywords: [],
        explanation: it.explanation,
        misconceptionTrap: it.misconception || '',
        sourceCitation: {
          documentId: doc?._id || null,
          documentName: doc?.originalName || '',
          chapterTitle: chapter.title,
          pageNumber: null,
          sectionTitle: it.section || chapter.title,
          excerpt: it.excerpt,
        },
        isDemo: true,
        createdAt: completedAt,
      });

      await StudentAnswer.create({
        userId: demoUser._id,
        assessmentId: assessment._id,
        questionId: q._id,
        subjectId: subject._id,
        topicId: topic._id,
        selectedAnswer: it.selectedAnswer,
        isCorrect: it.correct,
        partialScore: it.correct ? 1 : 0,
        aiFeedback: it.correct ? `Correct! ${it.explanation}` : `Incorrect. ${it.explanation}`,
        identifiedMisconception: it.correct ? '' : it.misconception || '',
        citation: {
          documentName: doc?.originalName || '',
          chapterTitle: chapter.title,
          pageNumber: null,
          sectionTitle: it.section || chapter.title,
          excerpt: it.excerpt,
        },
        isDemo: true,
        createdAt: completedAt,
      });
    }

    // Recompute diagnosis at this historical checkpoint & timestamp the TopicPerformance snapshot cleanly
    for (const tid of affectedTopics) {
      const updated = await recalculateTopicDiagnosis(demoUser._id, tid, demoUser.thresholds, assessment._id, true);
      if (updated) {
        await TopicPerformance.updateOne(
          { userId: demoUser._id, topicId: tid, assessmentId: assessment._id },
          { $set: { recordedAt: completedAt } }
        );
      }
    }
  }

  // Assessment 1 (12 days ago): Baseline Diagnostic — Linked Lists starts weak (33%), Trees critical (25%), Arrays strong (100%)
  await seedHistoricalAssessment({
    title: 'Baseline Diagnostic — Core Linear & Tree Structures',
    daysBack: 12,
    difficulty: 'medium',
    items: [
      {
        ch: 'Arrays',
        qDiff: 'medium',
        prompt: 'Why does accessing arr[i] run in O(1) time in a standard array?',
        options: ['Contiguous memory allows direct offset arithmetic', 'Arrays maintain hash buckets', 'Elements are linked via pointers', 'CPU sorts arrays automatically'],
        correctAnswer: 'Contiguous memory allows direct offset arithmetic',
        selectedAnswer: 'Contiguous memory allows direct offset arithmetic',
        correct: true,
        explanation: 'Elements occupy uniform contiguous slots so address = base + i * size.',
        section: 'Chapter 1: Arrays and Memory Layout',
        excerpt: 'Because every element occupies the same byte width in contiguous memory, random access by index i runs in O(1) constant time.',
      },
      {
        ch: 'Arrays',
        qDiff: 'medium',
        prompt: 'What is the worst-case time complexity of inserting an element at index 0 of an array of size n?',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
        correctAnswer: 'O(n)',
        selectedAnswer: 'O(n)',
        correct: true,
        explanation: 'All n existing elements must be shifted one position to the right.',
        section: 'Array Operations and Complexity',
        excerpt: 'Inserting or deleting an element at the beginning or middle of an array requires shifting subsequent elements and therefore runs in O(n) worst-case time.',
      },
      {
        ch: 'Linked Lists',
        qDiff: 'medium',
        prompt: 'What is the worst-case time complexity of accessing the k-th element in a singly linked list?',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
        correctAnswer: 'O(n)',
        selectedAnswer: 'O(1)',
        correct: false,
        misconception: 'Assuming linked lists support O(1) random index access like arrays',
        explanation: 'Linked lists lack contiguous layout and require sequential traversal from head.',
        section: 'Insertion, Deletion, and Access Complexity',
        excerpt: 'Unlike arrays, linked lists do not support O(1) random index access; reaching the k-th node requires sequential traversal from head in O(n) worst-case time.',
      },
      {
        ch: 'Linked Lists',
        qDiff: 'medium',
        prompt: 'How much auxiliary space does Floyd’s Cycle Detection algorithm require?',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
        correctAnswer: 'O(1)',
        selectedAnswer: 'O(n)',
        correct: false,
        misconception: 'Confusing Floyd two-pointer cycle detection with hash-set visited tracking',
        explanation: 'Floyd’s tortoise-and-hare algorithm uses only two pointers: O(1) auxiliary space.',
        section: 'Doubly Linked Lists and Cycle Detection',
        excerpt: "Floyd's Cycle Detection algorithm uses a slow pointer moving one step and a fast pointer moving two steps to detect loops in O(n) time and O(1) auxiliary space.",
      },
      {
        ch: 'Linked Lists',
        qDiff: 'easy',
        prompt: 'Inserting a new node at the head of a singly linked list runs in O(1) time.',
        qType: 'true_false',
        correctAnswer: 'True',
        selectedAnswer: 'True',
        correct: true,
        explanation: 'Only the new node next pointer and head pointer are updated.',
        section: 'Insertion, Deletion, and Access Complexity',
        excerpt: 'Inserting or deleting a node at the head of a singly linked list runs in O(1) time by updating the head pointer directly.',
      },
      {
        ch: 'Trees',
        qDiff: 'medium',
        prompt: 'Does every Binary Tree enforce the rule that left child keys must be smaller than the parent key?',
        options: ['No — only a Binary Search Tree enforces ordering', 'Yes — all Binary Trees are ordered', 'Only complete Binary Trees', 'Only balanced trees'],
        correctAnswer: 'No — only a Binary Search Tree enforces ordering',
        selectedAnswer: 'Yes — all Binary Trees are ordered',
        correct: false,
        misconception: 'Confusing Binary Search Tree (BST) ordering invariants with general Binary Trees',
        explanation: 'A general Binary Tree only limits nodes to at most two children; BST adds the global ordering invariant.',
        section: 'Binary Search Tree (BST) Invariant',
        excerpt: 'A general Binary Tree enforces NO ordering constraint on node values. Unlike a general Binary Tree, a Binary Search Tree (BST) maintains a strict global ordering invariant.',
      },
      {
        ch: 'Trees',
        qDiff: 'medium',
        prompt: 'Which traversal of a valid Binary Search Tree always outputs keys in sorted ascending order?',
        options: ['In-order (Left, Root, Right)', 'Pre-order (Root, Left, Right)', 'Post-order (Left, Right, Root)', 'Level-order'],
        correctAnswer: 'In-order (Left, Root, Right)',
        selectedAnswer: 'Pre-order (Root, Left, Right)',
        correct: false,
        misconception: 'Confusing Pre-order traversal with In-order traversal on a BST',
        explanation: 'In-order visits all smaller left-subtree keys, then root, then larger right-subtree keys.',
        section: 'Tree Traversals',
        excerpt: 'In-order traversal visits Left -> Root -> Right, and on a valid Binary Search Tree it always produces keys in sorted ascending order.',
      },
      {
        ch: 'Trees',
        qDiff: 'hard',
        prompt: 'To verify whether a Binary Tree is a valid BST, checking only immediate left < node < right children is sufficient.',
        qType: 'true_false',
        correctAnswer: 'False',
        selectedAnswer: 'True',
        correct: false,
        misconception: 'Confusing Binary Search Tree (BST) ordering invariants with general Binary Trees',
        explanation: 'Every node in the entire left subtree must be smaller than the ancestor, not just immediate children.',
        section: 'Binary Search Tree (BST) Invariant',
        excerpt: 'Checking only immediate left and right children is insufficient to validate a BST; every descendant must respect the ancestor bounds.',
      },
      {
        ch: 'Trees',
        qDiff: 'easy',
        prompt: 'What data structure does Level-order tree traversal use internally?',
        options: ['Queue', 'Stack', 'Hash Table', 'Adjacency Matrix'],
        correctAnswer: 'Queue',
        selectedAnswer: 'Queue',
        correct: true,
        explanation: 'Level-order traversal explores nodes breadth-first using a FIFO Queue.',
        section: 'Tree Traversals',
        excerpt: 'Level-order traversal uses a Queue to visit nodes breadth-first.',
      },
    ],
  });

  // Assessment 2 (6 days ago): Mid-Module Quiz — Linked Lists improves (~55%), Queues weak (~50%), Stacks developing (~75%), Trees still critical (~28%)
  await seedHistoricalAssessment({
    title: 'Mid-Module Diagnostic — Stacks, Queues, Linked Lists & Trees',
    daysBack: 6,
    difficulty: 'medium',
    items: [
      {
        ch: 'Linked Lists',
        qDiff: 'medium',
        prompt: 'Why does a doubly linked list allow O(1) deletion when given a pointer to the target node?',
        options: ['It has direct access to the previous node via prev', 'It uses contiguous memory', 'It avoids updating pointers', 'It hashes node addresses'],
        correctAnswer: 'It has direct access to the previous node via prev',
        selectedAnswer: 'It has direct access to the previous node via prev',
        correct: true,
        explanation: 'The prev pointer eliminates scanning from head to find the predecessor.',
        section: 'Doubly Linked Lists and Cycle Detection',
        excerpt: 'A doubly linked list stores both next and prev pointers in each node, enabling O(1) deletion when a direct reference to the target node is already known.',
      },
      {
        ch: 'Linked Lists',
        qDiff: 'medium',
        prompt: 'In a singly linked list, the tail node next pointer references null.',
        qType: 'true_false',
        correctAnswer: 'True',
        selectedAnswer: 'True',
        correct: true,
        explanation: 'Null marks the termination of traversal at the tail.',
        section: 'Chapter 2: Singly and Doubly Linked Lists',
        excerpt: 'Each node in a singly linked list stores a data value and a next pointer referencing the subsequent node, while the tail node points to null.',
      },
      {
        ch: 'Stacks',
        qDiff: 'easy',
        prompt: 'Which ordering principle governs Stack operations?',
        options: ['LIFO (Last In, First Out)', 'FIFO (First In, First Out)', 'Priority Order', 'Random Access'],
        correctAnswer: 'LIFO (Last In, First Out)',
        selectedAnswer: 'LIFO (Last In, First Out)',
        correct: true,
        explanation: 'The most recently pushed item is popped first.',
        section: 'Chapter 3: Stacks (LIFO Principle)',
        excerpt: 'A Stack is an abstract data type that follows the LIFO (Last In, First Out) principle.',
      },
      {
        ch: 'Stacks',
        qDiff: 'medium',
        prompt: 'What is the time complexity of push, pop, and peek on a stack?',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
        correctAnswer: 'O(1)',
        selectedAnswer: 'O(1)',
        correct: true,
        explanation: 'All operations access only the top pointer.',
        section: 'Chapter 3: Stacks (LIFO Principle)',
        excerpt: 'Both push, pop, and peek operations operate exclusively at the top of the stack and run in O(1) time.',
      },
      {
        ch: 'Stacks',
        qDiff: 'hard',
        prompt: 'Which algorithm primarily relies on a Queue rather than a Stack?',
        options: ['Breadth-First Search (BFS)', 'Function call frames', 'Balanced parenthesis checking', 'Postfix expression evaluation'],
        correctAnswer: 'Breadth-First Search (BFS)',
        selectedAnswer: 'Postfix expression evaluation',
        correct: false,
        misconception: 'Mixing up Stack (LIFO) vs Queue (FIFO) algorithm applications',
        explanation: 'Postfix evaluation uses a Stack; BFS uses a FIFO Queue.',
        section: 'Chapter 3: Stacks (LIFO Principle)',
        excerpt: 'Stacks power function call frames, expression evaluation (postfix/infix conversion), balanced parenthesis checking, and backtracking algorithms.',
      },
      {
        ch: 'Queues',
        qDiff: 'medium',
        prompt: 'In an array-based Circular Queue of capacity C, what condition indicates the queue is full?',
        options: ['(rear + 1) % C == front', 'rear == C - 1', 'front == rear + 1', 'front == 0'],
        correctAnswer: '(rear + 1) % C == front',
        selectedAnswer: 'rear == C - 1',
        correct: false,
        misconception: 'Confusing linear queue end-of-array check with circular queue modulo overflow condition',
        explanation: 'Circular queues wrap around using modulo arithmetic.',
        section: 'Circular Queue Overflow Condition',
        excerpt: 'A circular queue is full when (rear + 1) % capacity == front.',
      },
      {
        ch: 'Queues',
        qDiff: 'medium',
        prompt: 'Why is a Circular Queue preferred over a naive linear array queue?',
        options: ['Reuses empty front slots freed by dequeues', 'Eliminates FIFO ordering', 'Reduces enqueue to O(log n)', 'Allows O(1) middle insertion'],
        correctAnswer: 'Reuses empty front slots freed by dequeues',
        selectedAnswer: 'Reuses empty front slots freed by dequeues',
        correct: true,
        explanation: 'Wrapping indices reclaims dequeued front slots without shifting.',
        section: 'Circular Queue Overflow Condition',
        excerpt: 'In a fixed-size array-based linear queue, repeated dequeues leave wasted empty slots at the front. A Circular Queue solves this by wrapping indices modulo capacity.',
      },
      {
        ch: 'Queues',
        qDiff: 'hard',
        prompt: 'In a circular queue, wrap-around index advancement uses integer division rather than modulo.',
        qType: 'true_false',
        correctAnswer: 'False',
        selectedAnswer: 'True',
        correct: false,
        misconception: 'Confusing linear queue end-of-array check with circular queue modulo overflow condition',
        explanation: 'Circular queues advance pointers via (index + 1) % capacity.',
        section: 'Circular Queue Overflow Condition',
        excerpt: 'A Circular Queue solves this by wrapping indices modulo capacity using (rear + 1) % size.',
      },
      {
        ch: 'Trees',
        qDiff: 'medium',
        prompt: 'What happens to BST search complexity if already-sorted keys are inserted sequentially without balancing?',
        options: ['Degrades to O(n) worst-case due to a skewed tree', 'Remains strictly O(log n)', 'Improves to O(1)', 'Becomes O(n log n)'],
        correctAnswer: 'Degrades to O(n) worst-case due to a skewed tree',
        selectedAnswer: 'Remains strictly O(log n)',
        correct: false,
        misconception: 'Assuming an unbalanced BST always maintains O(log n) worst-case height',
        explanation: 'Sorted insertion forms a degenerate chain of height n, making lookup O(n).',
        section: 'BST Complexity and Balanced AVL Trees',
        excerpt: 'Inserting already sorted data into an unbalanced BST produces a skewed tree resembling a linked list, degrading search and insertion to O(n) worst-case time.',
      },
      {
        ch: 'Trees',
        qDiff: 'hard',
        prompt: 'What valid balance factor range does an AVL Tree maintain for every node?',
        options: ['{-1, 0, +1}', '{0, 1, 2}', '{-2, -1, 0, 1, 2}', 'Any non-negative integer'],
        correctAnswer: '{-1, 0, +1}',
        selectedAnswer: '{0, 1, 2}',
        correct: false,
        misconception: 'Confusing Binary Search Tree (BST) ordering invariants with general Binary Trees',
        explanation: 'AVL trees enforce |height(left) - height(right)| <= 1 via rotations.',
        section: 'BST Complexity and Balanced AVL Trees',
        excerpt: 'An AVL Tree is a self-balancing BST where the balance factor (height(left) - height(right)) of every node is kept in {-1, 0, +1} via single and double rotations.',
      },
    ],
  });

  // Assessment 3 (2 days ago): Post-Revision Mastery Check — Linked Lists climbs to ~78%, Arrays hits ~92%, Graphs ~66%, Sorting has only 1 attempt (Insufficient Data!)
  await seedHistoricalAssessment({
    title: 'Post-Revision Check — Linked Lists Recovery, Graphs & Arrays',
    daysBack: 2,
    difficulty: 'medium',
    items: [
      {
        ch: 'Arrays',
        qDiff: 'hard',
        prompt: 'Binary Search on a sorted array runs in O(log n) because each comparison halves the search space.',
        qType: 'true_false',
        correctAnswer: 'True',
        selectedAnswer: 'True',
        correct: true,
        explanation: 'Sorted order plus O(1) midpoint indexing achieves O(log n) search.',
        section: 'Array Operations and Complexity',
        excerpt: 'Binary Search on a sorted array divides the search space in half each step and runs in O(log n) time.',
      },
      {
        ch: 'Arrays',
        qDiff: 'medium',
        prompt: 'Why do arrays typically outperform linked lists in sequential scan speed?',
        options: ['Superior CPU cache locality due to contiguous memory', 'Lower asymptotic complexity than O(n)', 'Zero allocation cost', 'No bounds checking'],
        correctAnswer: 'Superior CPU cache locality due to contiguous memory',
        selectedAnswer: 'Superior CPU cache locality due to contiguous memory',
        correct: true,
        explanation: 'Contiguous memory allows hardware prefetching into CPU cache lines.',
        section: 'Cache Locality and Trade-offs',
        excerpt: 'Arrays provide superior CPU cache locality compared to pointer-based structures because adjacent elements are loaded together into cache lines.',
      },
      {
        ch: 'Linked Lists',
        qDiff: 'medium',
        prompt: 'After reviewing Linked Lists: reaching the k-th node requires O(n) sequential traversal from head.',
        qType: 'true_false',
        correctAnswer: 'True',
        selectedAnswer: 'True',
        correct: true,
        explanation: 'Pointer chasing cannot jump directly to index k.',
        section: 'Insertion, Deletion, and Access Complexity',
        excerpt: 'Reaching the k-th node requires sequential traversal from head in O(n) worst-case time.',
      },
      {
        ch: 'Linked Lists',
        qDiff: 'hard',
        prompt: 'Floyd’s cycle detection uses a slow pointer (1 step) and fast pointer (2 steps) in O(1) space.',
        qType: 'true_false',
        correctAnswer: 'True',
        selectedAnswer: 'True',
        correct: true,
        explanation: 'If a cycle exists, fast eventually laps and meets slow inside the loop.',
        section: 'Doubly Linked Lists and Cycle Detection',
        excerpt: "Floyd's Cycle Detection algorithm uses a slow pointer moving one step and a fast pointer moving two steps to detect loops in O(n) time and O(1) auxiliary space.",
      },
      {
        ch: 'Linked Lists',
        qDiff: 'medium',
        prompt: 'Which pointer trade-off distinguishes a Doubly Linked List from a Singly Linked List?',
        options: ['Extra prev pointer memory enables O(1) deletion with node reference', 'Eliminates O(n) search', 'Stores nodes contiguously', 'Disables head insertion'],
        correctAnswer: 'Extra prev pointer memory enables O(1) deletion with node reference',
        selectedAnswer: 'Extra prev pointer memory enables O(1) deletion with node reference',
        correct: true,
        explanation: 'Each node stores prev + next pointers, trading memory for O(1) known-node removal.',
        section: 'Doubly Linked Lists and Cycle Detection',
        excerpt: 'A doubly linked list stores both next and prev pointers in each node, enabling O(1) deletion when a direct reference to the target node is already known.',
      },
      {
        ch: 'Stacks',
        qDiff: 'medium',
        prompt: 'Stacks are used to track active function call frames during recursion.',
        qType: 'true_false',
        correctAnswer: 'True',
        selectedAnswer: 'True',
        correct: true,
        explanation: 'Each recursive call pushes a frame and pops it upon returning.',
        section: 'Chapter 3: Stacks (LIFO Principle)',
        excerpt: 'Stacks power function call frames, expression evaluation, balanced parenthesis checking, and backtracking algorithms.',
      },
      {
        ch: 'Queues',
        qDiff: 'easy',
        prompt: 'Queues follow the FIFO principle where dequeue removes the earliest inserted element.',
        qType: 'true_false',
        correctAnswer: 'True',
        selectedAnswer: 'True',
        correct: true,
        explanation: 'FIFO ensures arrival-order service.',
        section: 'Chapter 4: Queues and Circular Queues (FIFO Principle)',
        excerpt: 'A Queue is a linear data structure that follows the FIFO (First In, First Out) principle.',
      },
      {
        ch: 'Trees',
        qDiff: 'medium',
        prompt: 'Post-order traversal visits nodes in which exact order?',
        options: ['Left -> Right -> Root', 'Root -> Left -> Right', 'Left -> Root -> Right', 'Right -> Left -> Root'],
        correctAnswer: 'Left -> Right -> Root',
        selectedAnswer: 'Left -> Right -> Root',
        correct: true,
        explanation: 'Post-order processes both children before the root, ideal for safe deletion.',
        section: 'Tree Traversals',
        excerpt: 'Post-order traversal visits Left -> Right -> Root (useful for deleting a tree or evaluating expression trees).',
      },
      {
        ch: 'Trees',
        qDiff: 'hard',
        prompt: 'A Binary Tree where every node has at most two children automatically guarantees O(log n) search time.',
        qType: 'true_false',
        correctAnswer: 'False',
        selectedAnswer: 'True',
        correct: false,
        misconception: 'Confusing Binary Search Tree (BST) ordering invariants with general Binary Trees',
        explanation: 'Neither a general Binary Tree nor an unbalanced BST guarantees O(log n) search.',
        section: 'BST Complexity and Balanced AVL Trees',
        excerpt: 'A general Binary Tree enforces NO ordering constraint on node values, and an unbalanced BST degrades to O(n) worst-case time.',
      },
      {
        ch: 'Graphs',
        qDiff: 'medium',
        prompt: 'Which graph representation uses O(V + E) space and is best for sparse graphs?',
        options: ['Adjacency List', 'Adjacency Matrix', 'Incidence Matrix', 'Complete Matrix'],
        correctAnswer: 'Adjacency List',
        selectedAnswer: 'Adjacency List',
        correct: true,
        explanation: 'Adjacency lists store only existing edges rather than a V x V table.',
        section: 'Chapter 6: Graphs, Representations, and Traversals',
        excerpt: 'An Adjacency List uses O(V + E) space and is far more memory-efficient for sparse graphs.',
      },
      {
        ch: 'Graphs',
        qDiff: 'medium',
        prompt: 'Which traversal guarantees the shortest path (fewest edges) in an unweighted graph?',
        options: ['Breadth-First Search (BFS)', 'Depth-First Search (DFS)', 'Post-order DFS', 'Topological Sort'],
        correctAnswer: 'Breadth-First Search (BFS)',
        selectedAnswer: 'Breadth-First Search (BFS)',
        correct: true,
        explanation: 'BFS expands outward layer by layer from the source vertex.',
        section: 'BFS and DFS Traversals',
        excerpt: 'BFS guarantees finding the shortest path (minimum number of edges) in an unweighted graph.',
      },
      {
        ch: 'Graphs',
        qDiff: 'hard',
        prompt: 'Dijkstra’s shortest-path algorithm works accurately even when a graph contains negative edge weights.',
        qType: 'true_false',
        correctAnswer: 'False',
        selectedAnswer: 'True',
        correct: false,
        misconception: 'Applying Dijkstra algorithm to graphs with negative edge weights',
        explanation: 'Dijkstra assumes greedy finalized distances never decrease, which negative edges violate.',
        section: 'Shortest Paths and Minimum Spanning Trees',
        excerpt: "Dijkstra's algorithm finds single-source shortest paths in graphs with non-negative edge weights, but fails when negative edge weights exist.",
      },
      {
        ch: 'Sorting Algorithms',
        qDiff: 'medium',
        prompt: 'Merge Sort guarantees O(n log n) worst-case time complexity and is a stable sort.',
        qType: 'true_false',
        correctAnswer: 'True',
        selectedAnswer: 'True',
        correct: true,
        explanation: 'Merge Sort splits evenly regardless of input distribution and preserves equal-key order.',
        section: 'Comparison-Based Sorting Complexities',
        excerpt: 'Merge Sort uses divide-and-conquer to guarantee O(n log n) time in best, average, and worst cases and is stable.',
      },
    ],
  });

  // 4. Generate Personalized Revision Plan from the real diagnostic results
  const rev = await syncRevisionPlanForSubject(demoUser._id, subject._id, true);

  // Add one completed historical revision task for Linked Lists to demonstrate closed-loop improvement
  if (rev?.plan) {
    const llTopic = topicsByChapterTitle.get('Linked Lists');
    const llDoc = docsByChapterTitle.get('Linked Lists');
    await RevisionTask.create({
      userId: demoUser._id,
      planId: rev.plan._id,
      subjectId: subject._id,
      topicId: llTopic._id,
      topicName: `${llTopic.name} — Pointer Fundamentals Recovery`,
      priority: 'high',
      reason: 'Completed after initial 33% baseline score; lifted Linked Lists mastery to 78%.',
      recommendedMaterial: {
        documentId: llDoc?._id || null,
        documentName: llDoc?.originalName || 'CS201_Ch2_Linked_Lists_Textbook.txt',
        chapterTitle: 'Linked Lists',
        sectionRef: 'Chapter 2: Linked Lists',
      },
      suggestedDurationMinutes: 30,
      activities: [
        { label: 'Reviewed Chapter 2 pointer traversal & doubly linked lists', done: true },
        { label: 'Practiced Floyd cycle detection O(1) space proof', done: true },
        { label: 'Retook Linked Lists diagnostic check (score jumped +45 pts)', done: true },
      ],
      status: 'completed',
      completedAt: daysAgo(3),
      currentMastery: llTopic.masteryScore,
      targetMastery: 80,
      isDemo: true,
    });
    await syncRevisionPlanForSubject(demoUser._id, subject._id, true);
  }

  // 5. Seed one grounded welcome Q&A in ChatHistory so students see source citations immediately
  const treeDoc = docsByChapterTitle.get('Trees');
  await ChatHistory.insertMany([
    {
      userId: demoUser._id,
      subjectId: subject._id,
      role: 'user',
      message: 'Why do I keep mixing up Binary Trees and Binary Search Trees?',
      isDemo: true,
    },
    {
      userId: demoUser._id,
      subjectId: subject._id,
      role: 'assistant',
      grounded: true,
      message:
        'Based on your uploaded **Data Structures** textbook notes:\n\n' +
        '- **[Source 1: CS201_Ch5_Trees_and_BST_Textbook.txt (Binary Search Tree (BST) Invariant)]** A general Binary Tree only limits each node to at most two children and enforces **no ordering constraint** on values. A Binary Search Tree (BST) adds a strict global ordering invariant: every key in a node\'s left subtree must be strictly smaller, and every key in its right subtree must be strictly greater.\n' +
        '- **[Source 2: CS201_Ch5_Trees_and_BST_Textbook.txt (Tree Traversals)]** Because of this global invariant, an **In-order traversal (Left → Root → Right)** of a valid BST always produces keys in sorted ascending order.\n\n' +
        '**Diagnostic tip:** Binary Trees & BSTs is currently your highest-priority gap. Try a 5-question targeted quiz after reviewing Chapter 5.',
      citations: [
        {
          documentId: treeDoc?._id?.toString() || '',
          documentName: treeDoc?.originalName || 'CS201_Ch5_Trees_and_BST_Textbook.txt',
          chapterTitle: 'Trees',
          pageNumber: null,
          sectionTitle: 'Binary Search Tree (BST) Invariant',
          excerpt:
            'Unlike a general Binary Tree, a Binary Search Tree (BST) maintains a strict global ordering invariant: for every node N, all keys in N\'s left subtree are strictly smaller than N\'s key...',
          relevanceScore: 0.91,
        },
      ],
      relatedTopics: ['Binary Trees & BSTs', 'Queues & Circular Queues'],
      isDemo: true,
    },
  ]);

  return demoUser;
}

module.exports = { ensureDemoAccountSeeded };
