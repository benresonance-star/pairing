// General environment settings for the BuildSync Archicad add-on.

#ifndef BUILDSYNC_APIENVIR_H
#define BUILDSYNC_APIENVIR_H

#if defined(_MSC_VER)
    #if !defined(WINDOWS)
        #define WINDOWS
    #endif
#endif

#if defined(WINDOWS)
    #include "Win32Interface.hpp"
#endif

#if !defined(ACExtension)
    #define ACExtension
#endif

#endif
