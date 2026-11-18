const SAMPLE_FILES = [
  {
    filename: 'CS201_Ch1_Arrays_Lecture_Notes.txt',
    chapterTitle: 'Arrays',
    docCategory: 'notes',
    content: `# Chapter 1: Arrays and Memory Layout

Arrays are fixed-size sequential collections of elements stored in contiguous memory locations. Because every element occupies the same byte width in contiguous memory, random access by index i runs in O(1) constant time using address arithmetic base_address + i * element_size.

## Array Operations and Complexity
Insertion at the end of a dynamic array runs in amortized O(1) time, whereas inserting or deleting an element at the beginning or middle of an array requires shifting subsequent elements and therefore runs in O(n) worst-case time. Linear search on an unsorted array takes O(n) time, while Binary Search on a sorted array divides the search space in half each step and runs in O(log n) time.

## Cache Locality and Trade-offs
Arrays provide superior CPU cache locality compared to pointer-based structures because adjacent elements are loaded together into cache lines. However, static arrays cannot grow dynamically without allocating a larger contiguous block and copying existing elements in O(n) time.`,
  },
  {
    filename: 'CS201_Ch2_Linked_Lists_Textbook.txt',
    chapterTitle: 'Linked Lists',
    docCategory: 'textbook',
    content: `# Chapter 2: Singly and Doubly Linked Lists

A Linked List is a linear data structure where elements called nodes are stored in non-contiguous memory locations and connected using pointers. Each node in a singly linked list stores a data value and a next pointer referencing the subsequent node, while the tail node points to null.

## Insertion, Deletion, and Access Complexity
Inserting or deleting a node at the head of a singly linked list runs in O(1) time by updating the head pointer directly. Unlike arrays, linked lists do not support O(1) random index access; reaching the k-th node requires sequential traversal from head in O(n) worst-case time.

## Doubly Linked Lists and Cycle Detection
A doubly linked list stores both next and prev pointers in each node, enabling O(1) deletion when a direct reference to the target node is already known, at the cost of extra memory per node. Floyd's Cycle Detection algorithm (tortoise and hare) uses a slow pointer moving one step and a fast pointer moving two steps to detect loops in O(n) time and O(1) auxiliary space.`,
  },
  {
    filename: 'CS201_Ch3_4_Stacks_and_Queues_Notes.txt',
    chapterTitle: 'Stacks',
    docCategory: 'notes',
    content: `# Chapter 3: Stacks (LIFO Principle)

A Stack is an abstract data type that follows the LIFO (Last In, First Out) principle, meaning the most recently pushed element is the first element popped. Both push, pop, and peek operations operate exclusively at the top of the stack and run in O(1) time. Stacks power function call frames, expression evaluation (postfix/infix conversion), balanced parenthesis checking, and backtracking algorithms.

# Chapter 4: Queues and Circular Queues (FIFO Principle)

A Queue is a linear data structure that follows the FIFO (First In, First Out) principle, where elements are inserted at the rear (enqueue) and removed from the front (dequeue) in O(1) time. Unlike a stack, a queue preserves arrival order and is essential for Breadth-First Search (BFS), CPU task scheduling, and printer spooling.

## Circular Queue Overflow Condition
In a fixed-size array-based linear queue, repeated dequeues leave wasted empty slots at the front. A Circular Queue solves this by wrapping indices modulo capacity using (rear + 1) % size. A circular queue is full when (rear + 1) % capacity == front, whereas it is empty when front == -1 (or front == rear in one-slot-reserved designs).`,
  },
  {
    filename: 'CS201_Ch5_Trees_and_BST_Textbook.txt',
    chapterTitle: 'Trees',
    docCategory: 'textbook',
    content: `# Chapter 5: Binary Trees and Binary Search Trees (BST)

A Binary Tree is a hierarchical data structure in which every node has at most two children, referred to as the left child and right child. A general Binary Tree enforces NO ordering constraint on node values.

## Binary Search Tree (BST) Invariant
Unlike a general Binary Tree, a Binary Search Tree (BST) maintains a strict global ordering invariant: for every node N, all keys in N's left subtree are strictly smaller than N's key, and all keys in N's right subtree are strictly greater than N's key. Checking only immediate left and right children is insufficient to validate a BST; every descendant must respect the ancestor bounds.

## Tree Traversals
In-order traversal visits Left -> Root -> Right, and on a valid Binary Search Tree it always produces keys in sorted ascending order. Pre-order traversal visits Root -> Left -> Right (useful for copying/serializing trees), and Post-order traversal visits Left -> Right -> Root (useful for deleting a tree or evaluating expression trees). Level-order traversal uses a Queue to visit nodes breadth-first.

## BST Complexity and Balanced AVL Trees
Searching, inserting, or deleting in a balanced BST runs in O(log n) time. However, inserting already sorted data into an unbalanced BST produces a skewed tree resembling a linked list, degrading search and insertion to O(n) worst-case time. An AVL Tree is a self-balancing BST where the balance factor (height(left) - height(right)) of every node is kept in {-1, 0, +1} via single and double rotations, guaranteeing O(log n) worst-case height.`,
  },
  {
    filename: 'CS201_Ch6_Graphs_Traversal_Notes.txt',
    chapterTitle: 'Graphs',
    docCategory: 'notes',
    content: `# Chapter 6: Graphs, Representations, and Traversals

A Graph G = (V, E) consists of a set of vertices V connected by edges E, which may be directed or undirected and weighted or unweighted. An Adjacency Matrix uses O(V^2) space and checks edge existence in O(1) time, whereas an Adjacency List uses O(V + E) space and is far more memory-efficient for sparse graphs.

## BFS and DFS Traversals
Breadth-First Search (BFS) explores a graph level by level using a Queue and runs in O(V + E) time; BFS guarantees finding the shortest path (minimum number of edges) in an unweighted graph. Depth-First Search (DFS) explores as far as possible along each branch using recursion or an explicit Stack, running in O(V + E) time and enabling cycle detection and topological sorting of Directed Acyclic Graphs (DAGs).

## Shortest Paths and Minimum Spanning Trees
Dijkstra's algorithm finds single-source shortest paths in graphs with non-negative edge weights in O((V + E) log V) time using a min-priority queue, but fails when negative edge weights exist. Prim's and Kruskal's algorithms compute a Minimum Spanning Tree (MST) connecting all vertices with minimum total edge weight.`,
  },
  {
    filename: 'CS201_Ch7_Sorting_Algorithms_Reference.txt',
    chapterTitle: 'Sorting Algorithms',
    docCategory: 'syllabus',
    content: `# Chapter 7: Sorting Algorithms and Stability

Sorting arranges records in a specified order. A sorting algorithm is stable if elements with equal keys preserve their original relative order after sorting.

## Comparison-Based Sorting Complexities
Merge Sort uses divide-and-conquer to guarantee O(n log n) time in best, average, and worst cases and is stable, but requires O(n) auxiliary space. Quick Sort partitions elements around a pivot in-place with O(n log n) average time and O(log n) stack space, though poor pivot selection degrades worst-case time to O(n^2). Heap Sort guarantees O(n log n) worst-case time with O(1) auxiliary space but is unstable. Insertion Sort runs in O(n^2) worst-case time yet achieves O(n) time on nearly sorted inputs.`,
  },
];

module.exports = { SAMPLE_FILES };
