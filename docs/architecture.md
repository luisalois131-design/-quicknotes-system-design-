# QuickNotes System Architecture

## 1. Overview

QuickNotes is evolving from a browser-only application into an online service intended to support one million registered users.

The proposed architecture separates the client, application processing, caching, database access, and background jobs. Each layer can be scaled or maintained independently as demand increases.

The API client in this project uses JSONPlaceholder for practice. The architecture below describes the real production service that the backend team should build.

## 2. Functional Requirements

The system must:

1. Allow users to register, log in, and log out.
2. Allow authenticated users to create notes.
3. Allow users to list and view their own notes.
4. Allow users to update and delete their notes.
5. Allow users to create tags and organize notes using tags.
6. Prevent users from reading or modifying another user's private notes.
7. Validate input and return meaningful error messages.
8. Support pagination for large note collections.
9. Process suitable background tasks through a queue and worker.
10. Provide an API that browser and mobile clients can use.

## 3. Non-Functional Requirements

### Performance

- Target low-latency responses for common note operations.
- Support increased read traffic through caching and database read replicas.
- Use pagination to avoid returning excessively large responses.

### Scalability

- Add application server instances as request volume increases.
- Scale background workers independently from API servers.
- Increase database capacity as storage and query demand grow.

### Availability

- Run multiple application server instances across failure domains.
- Use health checks and automatic replacement of unhealthy instances.
- Configure database backups and a tested failover strategy.

### Security

- Enforce HTTPS.
- Authenticate users and authorize access to each note.
- Store password hashes rather than plaintext passwords.
- Validate all user input and use parameterized database queries.
- Apply rate limits, secure secret management, and audit logging.

### Reliability and maintainability

- Monitor latency, errors, resource use, and queue depth.
- Retry transient background-job failures with bounded retries.
- Use automated tests, version-controlled migrations, and documented recovery procedures.

## 4. Load Estimates for One Million Users

### Assumptions

For this initial capacity estimate:

- Registered users: 1,000,000.
- Daily active users: 10% of registered users.
- Each daily active user performs 20 note-reading requests per day.
- Each daily active user creates 1 note per day.
- Average stored note record size: 2 KB, including an allowance for typical metadata.
- Average traffic is spread over 86,400 seconds per day.
- Peak request rates are estimated at 5 times the average.
- The estimate excludes database indexes, backups, replicas, logs, and other operational overhead.

These are planning assumptions rather than measured production traffic. Real usage should be measured and the estimates revised.

### A. Daily Active Users

Daily active users = 1,000,000 × 10%

**Daily active users = 100,000.**

### B. Reads Per Second

Daily reads = 100,000 × 20

Daily reads = 2,000,000

Average reads per second:

2,000,000 ÷ 86,400 = 23.15

**Average reads = approximately 23 per second.**

Estimated peak reads:

23.15 × 5 = 115.74

**Peak reads = approximately 116 per second.**

### C. Writes Per Second

Daily writes = 100,000 × 1

Daily writes = 100,000

Average writes per second:

100,000 ÷ 86,400 = 1.16

**Average writes = approximately 1.16 per second.**

Estimated peak writes:

1.16 × 5 = 5.79

**Peak writes = approximately 6 per second.**

This estimate counts note creations as writes. Editing notes, deleting notes, tag operations, and other database mutations would add to the write load.

### D. Storage Per Year

Daily note data generated:

100,000 notes × 2 KB = 200,000 KB per day.

Using decimal units:

200,000 KB = 200 MB per day.

Annual storage growth:

200 MB × 365 = 73,000 MB.

73,000 MB = 73 GB.

**Estimated annual note-record storage growth = 73 GB.**

This estimate excludes indexes, backups, replicas, logs, user account records, tags, and other data. The database's actual provisioned storage must be larger.

### Summary

| Metric | Average / estimate | Peak or annual estimate |
|---|---:|---:|
| Registered users | 1,000,000 | — |
| Daily active users | 100,000 | — |
| Note reads per second | 23.15 | 116 per second |
| Note writes per second | 1.16 | 6 per second |
| New note data | 200 MB/day | 73 GB/year |

The read-to-write ratio for the assumed note workload is approximately 20:1. QuickNotes is therefore read-heavy under these assumptions, so caching, efficient indexes, and read replicas are valuable.

## 5. Architecture Diagram

```text
                  +----------------------+
                  |  Web / Mobile Client |
                  +----------------------+
                             |
                             v
                  +----------------------+
                  |         DNS          |
                  | Domain name lookup   |
                  +----------------------+
                             |
                             v
                  +----------------------+
                  |         CDN          |
                  | Static assets/cache  |
                  +----------------------+
                             |
                             v
                  +----------------------+
                  |    Load Balancer     |
                  | Health checks/routing|
                  +----------------------+
                             |
                 +-----------+-----------+
                 |           |           |
                 v           v           v
           +-----------+ +-----------+ +-----------+
           | App       | | App       | | App       |
           | Server 1  | | Server 2  | | Server N  |
           +-----------+ +-----------+ +-----------+
                 |           |           |
                 +-----------+-----------+
                             |
                +------------+------------+
                |                         |
                v                         v
          +-------------+          +-------------+
          | Cache       |          | Primary DB  |
          | Sessions /  |          | Writes and  |
          | frequent    |          | authoritative|
          | reads       |          | data        |
          +-------------+          +-------------+
                                         |
                                         v
                                  +-------------+
                                  | Read Replica|
                                  | Read queries|
                                  +-------------+

                  BACKGROUND PROCESSING

           App Server
                |
                v
          +-------------+
          | Message     |
          | Queue       |
          +-------------+
                |
                v
          +-------------+
          | Background  |
          | Worker      |
          +-------------+
                |
                v
          +---------------------------+
          | Async jobs, such as       |
          | notifications and exports |
          +---------------------------+
```

The CDN primarily accelerates static files such as CSS, JavaScript, and other cacheable public assets. Private note data must not be publicly cached, and personalized API responses require appropriate cache controls.

## 6. Components and Their Responsibilities

1. **Client:** Provides the interface through which users create, view, edit, and delete notes.

2. **DNS:** Resolves the service's domain name to the appropriate entry point so clients can locate the application.

3. **CDN:** Serves cacheable static assets close to users, reducing latency and the number of requests reaching the application infrastructure.

4. **Load balancer:** Distributes incoming requests among healthy application servers and removes unhealthy instances from rotation.

5. **Application servers:** Execute API logic, validate input, authenticate users, enforce ownership rules, and coordinate database and background operations.

6. **Cache:** Keeps frequently requested data or session information in fast storage to reduce repeated database reads, subject to correct expiration and invalidation policies.

7. **Primary database:** Stores authoritative user, note, tag, and relationship records and processes transactions and writes.

8. **Read replica:** Serves eligible read queries to reduce load on the primary database, with the understanding that replication lag may temporarily delay visibility of recent changes.

9. **Message queue:** Buffers background tasks so the API can respond without waiting for non-essential processing to finish.

10. **Background worker:** Processes queued jobs, such as sending notifications, generating exports, or other asynchronous tasks, and retries eligible failures.

11. **Monitoring and logging:** Collects health metrics, request errors, latency, and queue information so the team can detect and investigate problems.

12. **Backup and recovery system:** Maintains recoverable database backups and supports restoration after data loss or infrastructure failure.

## 7. GET /notes Request Flow

1. The user opens the notes page in a browser or mobile application.

2. DNS resolves the QuickNotes domain, and the client sends an HTTPS request to the application entry point.

3. The load balancer selects a healthy application server.

4. The application server validates the access token and identifies the authenticated user.

5. The server validates pagination parameters and confirms that the request is permitted.

6. The server checks the cache for an eligible cached result keyed by the user and query parameters.

7. If a valid cache entry exists, the server returns the result without repeating the database query.

8. On a cache miss, the server queries the database, using the read replica when suitable or the primary when freshness requirements demand it.

9. The server applies the user's ownership filter and pagination, then formats the JSON response.

10. Where appropriate, the result is cached with a suitable expiration policy.

11. The server returns `200 OK` with the notes and pagination metadata.

12. If the request fails, the server returns the appropriate error status and a consistent error body.

## 8. POST /notes Request Flow

1. The user fills in the note title and optional body and submits the form.

2. The client sends `POST /v1/notes` over HTTPS with a JSON body and access token.

3. The load balancer routes the request to a healthy application server.

4. The application server validates the access token and derives the user's identity from the authenticated session.

5. The server validates the title, body, permitted fields, and any referenced tags.

6. The server begins a database transaction and inserts the note using a parameterized query.

7. If tags are included, the server verifies ownership and creates the note-tag associations within the transaction.

8. The database commits the transaction and returns the generated note identifier and stored record.

9. The application invalidates or updates affected cache entries so future reads do not return stale data.

10. If an asynchronous task is required, the server publishes it to the queue using a reliable delivery strategy, such as a transactional outbox when necessary.

11. The server responds with `201 Created` and the new note's JSON representation.

12. A background worker processes any queued task independently, retrying eligible failures without requiring the user to resubmit the note.

If the transaction fails, it is rolled back and the API returns an appropriate error response.

## 9. Trade-Offs

### Trade-Off 1: Cache Performance Versus Data Freshness

Caching reduces database load and improves response times, but a cached note list may not reflect a recent change immediately. QuickNotes should use appropriate expiration times and invalidate or update affected entries after writes.

### Trade-Off 2: Read Replicas Versus Consistency

Read replicas distribute database reads, but replication lag can cause recently created or updated notes to be temporarily missing from a read response. Requests that require immediate read-after-write consistency should use the primary or another explicitly consistent strategy.

### Trade-Off 3: Asynchronous Work Versus Immediate Completion

A queue lets the API return quickly while workers handle notifications and exports. However, queued jobs can be delayed or fail, so the system needs retries, monitoring, idempotent processing, and a dead-letter strategy for persistent failures.

### Trade-Off 4: Multiple Servers Versus Operational Cost

Running several application servers improves availability and makes horizontal scaling possible, but increases infrastructure costs and deployment complexity. Autoscaling and monitoring can help balance cost against capacity.

## 10. Avoiding Single Points of Failure

A single point of failure is a component whose failure can make the entire service unavailable.

QuickNotes should reduce these risks as follows:

- **Application servers:** Run at least two instances across separate failure domains behind a health-checking load balancer.
- **Load balancer:** Use a managed or redundant load-balancing service rather than relying on one manually maintained instance.
- **DNS:** Use a reliable DNS provider with health-aware routing or appropriate failover capabilities where required.
- **Cache:** Deploy a supported highly available cache configuration and allow the application to fall back safely to the database when feasible.
- **Primary database:** Configure automated backups, point-in-time recovery, monitoring, and a tested standby promotion or failover process.
- **Read replica:** Monitor replication lag and have a fallback strategy when the replica is unavailable.
- **Message queue:** Use a durable, highly available queue service, monitor backlog, and configure retries and dead-letter handling.
- **Background workers:** Run multiple worker instances and ensure jobs can be retried without duplicating side effects.
- **Deployment and configuration:** Use automated deployments, health checks, centralized monitoring, and managed secrets to reduce human error and configuration drift.

Redundancy alone does not guarantee availability. Failover must be tested, and recovery objectives should be defined for acceptable data loss and downtime.

## 11. Scaling Strategy

### Initial stage

- Deploy the application behind a load balancer.
- Use a managed PostgreSQL database.
- Add indexes based on common queries.
- Apply pagination and input validation.
- Collect metrics before optimizing bottlenecks.

### Growth stage

- Add application instances as demand increases.
- Introduce caching for frequently requested data.
- Add a read replica for suitable read workloads.
- Move notifications, exports, and other slow tasks to background workers.
- Review database connections, slow queries, and queue depth.

### Large-scale stage

- Evaluate partitioning or other database scaling strategies using measured workload data.
- Add more sophisticated cache invalidation and capacity controls.
- Establish multi-zone failover and disaster recovery procedures.
- Perform load testing against realistic read/write patterns.
- Review infrastructure cost and service-level objectives regularly.

## 12. Conclusion

QuickNotes can support growth toward one million registered users by separating client delivery, application processing, database storage, caching, and asynchronous work.

Under the stated assumptions, the service averages approximately 23 note reads per second and 1.16 note writes per second, with estimated peak rates of 116 reads and 6 writes per second. Note records generate approximately 73 GB of new data per year before operational overhead.

These figures are starting estimates, not capacity guarantees. Load testing, monitoring, security reviews, and tested recovery procedures are essential before production deployment.