#define _GNU_SOURCE
#include <errno.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <unistd.h>

int connect(int fd, const struct sockaddr *address, socklen_t length) {
  if (address &&
      (address->sa_family == AF_INET || address->sa_family == AF_INET6)) {
    errno = ENETUNREACH;
    return -1;
  }
  return (int)syscall(SYS_connect, fd, address, length);
}
